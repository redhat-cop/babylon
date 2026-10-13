package api

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func testDirectTransport(dial func(context.Context, string, string) (net.Conn, error)) *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = dial
	return transport
}

func TestProxyFallbackAfterDialFailurePreservesOrder(t *testing.T) {
	const body = `{"spec":{"provider":{"name":"test-item"}}}`
	var proxyRequests atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyRequests.Add(1)
		data, _ := io.ReadAll(r.Body)
		if r.Method != http.MethodPost || string(data) != body || r.Host != "api.example.test" {
			t.Errorf("proxy received incorrect order: method=%s host=%s body=%s", r.Method, r.Host, data)
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer proxy.Close()
	proxyURL, _ := url.Parse(proxy.URL)
	directAttempts, detections := 0, 0
	transport := &proxyFallbackTransport{
		direct: testDirectTransport(func(ctx context.Context, network, address string) (net.Conn, error) {
			if address == "api.example.test:80" {
				directAttempts++
				return nil, &net.OpError{Op: "dial", Net: network, Err: errors.New("direct connection unavailable")}
			}
			return (&net.Dialer{}).DialContext(ctx, network, address)
		}),
		detect: func(context.Context) *url.URL {
			detections++
			if directAttempts == 0 {
				t.Error("detected proxy before trying direct access")
			}
			return proxyURL
		},
	}
	defer transport.CloseIdleConnections()
	req, _ := http.NewRequestWithContext(t.Context(), http.MethodPost, "http://api.example.test/resourceclaims", strings.NewReader(body))
	resp, err := transport.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated || directAttempts != 1 || detections != 1 || proxyRequests.Load() != 1 {
		t.Fatalf("status=%d direct=%d detection=%d proxy=%d", resp.StatusCode, directAttempts, detections, proxyRequests.Load())
	}
}

func TestProxyFallbackDoesNotReplaceDirectResponses(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusForbidden, http.StatusServiceUnavailable} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
			}))
			defer server.Close()
			transport := &proxyFallbackTransport{
				direct: testDirectTransport(func(ctx context.Context, network, _ string) (net.Conn, error) {
					return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
				}),
				detect: func(context.Context) *url.URL {
					t.Error("detected proxy despite a direct HTTP response")
					return nil
				},
			}
			defer transport.CloseIdleConnections()
			req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://api.example.test/", nil)
			resp, err := transport.RoundTrip(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != status {
				t.Errorf("status=%d, want %d", resp.StatusCode, status)
			}
		})
	}
}

func TestProxyFallbackDoesNotReplaySubmittedOrder(t *testing.T) {
	var orders atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orders.Add(1)
		_, _ = io.ReadAll(r.Body)
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		conn.Close() // The order was received, but its response was lost.
	}))
	defer server.Close()
	transport := &proxyFallbackTransport{
		direct: testDirectTransport(func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
		}),
		detect: func(context.Context) *url.URL {
			t.Error("attempted proxy fallback after sending an order")
			return nil
		},
	}
	defer transport.CloseIdleConnections()
	req, _ := http.NewRequestWithContext(t.Context(), http.MethodPost, "http://api.example.test/resourceclaims", strings.NewReader(`{}`))
	if _, err := transport.RoundTrip(req); err == nil {
		t.Fatal("accepted a lost order response")
	}
	if orders.Load() != 1 {
		t.Errorf("submitted %d orders, want 1", orders.Load())
	}
}

func TestProxyFallbackUnavailable(t *testing.T) {
	for _, tc := range []struct {
		name, host       string
		cancel, streamed bool
	}{
		{name: "VPN unavailable", host: "api.example.test"},
		{name: "loopback", host: "localhost"},
		{name: "canceled request", host: "api.example.test", cancel: true},
		{name: "non-replayable body", host: "api.example.test", streamed: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			want := errors.New("direct connection failed")
			detections := 0
			transport := &proxyFallbackTransport{
				direct: testDirectTransport(func(_ context.Context, network, _ string) (net.Conn, error) {
					return nil, &net.OpError{Op: "dial", Net: network, Err: want}
				}),
				detect: func(context.Context) *url.URL { detections++; return nil },
			}
			defer transport.CloseIdleConnections()
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			if tc.cancel {
				cancel()
			}
			var body io.Reader
			if tc.streamed {
				body = io.NopCloser(strings.NewReader(`{}`))
			}
			req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+tc.host+"/", body)
			_, err := transport.RoundTrip(req)
			if tc.cancel {
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("got %v, want canceled request", err)
				}
			} else if !errors.Is(err, want) {
				t.Fatalf("lost direct connection error: %v", err)
			}
			wantDetections := 0
			if tc.name == "VPN unavailable" {
				wantDetections = 1
			}
			if detections != wantDetections {
				t.Errorf("detections=%d, want %d", detections, wantDetections)
			}
		})
	}
}

func TestExplicitProxySettingsDisableAutomaticFallback(t *testing.T) {
	keys := []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"}
	for _, key := range keys {
		value, existed := os.LookupEnv(key)
		t.Cleanup(func() {
			if existed {
				_ = os.Setenv(key, value)
			} else {
				_ = os.Unsetenv(key)
			}
		})
		_ = os.Unsetenv(key)
	}
	for _, tc := range []struct{ key, value string }{
		{"HTTPS_PROXY", "http://explicit.example.test:3128"},
		{"https_proxy", "http://explicit.example.test:3128"},
		{"HTTP_PROXY", ""}, {"http_proxy", ""},
		{"NO_PROXY", "*"}, {"no_proxy", "api.example.test"},
	} {
		t.Run(tc.key, func(t *testing.T) {
			t.Setenv(tc.key, tc.value)
			client := NewClient("http://api.example.test")
			want := errors.New("explicit connection failed")
			client.getTransport().DialContext = func(_ context.Context, network, _ string) (net.Conn, error) {
				return nil, &net.OpError{Op: "dial", Net: network, Err: want}
			}
			if fallback, ok := client.HTTPClient.Transport.(*proxyFallbackTransport); ok {
				fallback.detect = func(context.Context) *url.URL { t.Error("ignored explicit proxy configuration"); return nil }
			}
			if _, err := client.get("/"); !errors.Is(err, want) {
				t.Fatalf("lost explicit connection error: %v", err)
			}
		})
	}
}

func TestProxyFallbackPreservesTLSConfiguration(t *testing.T) {
	proxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer proxy.Close()
	proxyURL, _ := url.Parse(proxy.URL)
	transport := &proxyFallbackTransport{
		direct: testDirectTransport(func(ctx context.Context, network, address string) (net.Conn, error) {
			if address == "api.example.test:80" {
				return nil, &net.OpError{Op: "dial", Net: network, Err: errors.New("direct access unavailable")}
			}
			return (&net.Dialer{}).DialContext(ctx, network, address)
		}),
		detect: func(context.Context) *url.URL { return proxyURL },
	}
	defer transport.CloseIdleConnections()
	client := NewClient("http://api.example.test")
	client.HTTPClient.Transport = transport
	client.SetInsecureSkipVerify(true)
	if client.HTTPClient.Transport != transport {
		t.Fatal("TLS configuration discarded proxy fallback")
	}
	if _, err := client.get("/"); err != nil {
		t.Fatal(err)
	}
}
