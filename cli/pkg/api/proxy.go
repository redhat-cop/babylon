package api

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const rhProxyHost = "squid.redhat.com"

func newHTTPTransport() http.RoundTripper {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if hasProxyEnv() {
		transport.Proxy = http.ProxyFromEnvironment
		return transport
	}
	transport.Proxy = nil
	// Leave time within the client's timeout for proxy discovery and fallback.
	transport.DialContext = (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	return &proxyFallbackTransport{direct: transport, detect: detectRHProxy}
}

func hasProxyEnv() bool {
	for _, name := range []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"} {
		if _, ok := os.LookupEnv(name); ok {
			return true
		}
	}
	return false
}

func isLoopback(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func detectRHProxy(ctx context.Context) *url.URL {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if _, err := net.DefaultResolver.LookupHost(ctx, rhProxyHost); err != nil {
		return nil
	}
	return &url.URL{Scheme: "http", Host: net.JoinHostPort(rhProxyHost, "3128")}
}

type proxyFallbackTransport struct {
	direct *http.Transport
	detect func(context.Context) *url.URL
	mu     sync.Mutex
	proxy  *http.Transport
}

func (t *proxyFallbackTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	var connected atomic.Bool
	trace := &httptrace.ClientTrace{GotConn: func(httptrace.GotConnInfo) { connected.Store(true) }}
	response, directErr := t.direct.RoundTrip(req.WithContext(httptrace.WithClientTrace(req.Context(), trace)))
	if directErr == nil || connected.Load() || req.Context().Err() != nil || isLoopback(req.URL.Hostname()) {
		return response, directErr
	}
	var dialErr *net.OpError
	if !errors.As(directErr, &dialErr) || dialErr.Op != "dial" {
		return response, directErr
	}
	// Transport closes the original body even if dialing fails. Only retry when
	// it can be recreated, and never after obtaining an HTTP connection.
	if req.Body != nil && req.Body != http.NoBody && req.GetBody == nil {
		return response, directErr
	}
	proxy := t.proxyTransport(req.Context())
	if proxy == nil {
		return response, directErr
	}
	retry := req.Clone(req.Context())
	if req.Body != nil && req.Body != http.NoBody {
		body, err := req.GetBody()
		if err != nil {
			return nil, errors.Join(directErr, fmt.Errorf("recreating request body: %w", err))
		}
		retry.Body = body
	}
	response, err := proxy.RoundTrip(retry)
	if err != nil {
		return nil, errors.Join(directErr, fmt.Errorf("proxy fallback failed: %w", err))
	}
	return response, nil
}

func (t *proxyFallbackTransport) proxyTransport(ctx context.Context) *http.Transport {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.proxy == nil {
		proxyURL := t.detect(ctx)
		if proxyURL == nil {
			return nil
		}
		t.proxy = t.direct.Clone()
		t.proxy.Proxy = http.ProxyURL(proxyURL)
	}
	return t.proxy
}

func (t *proxyFallbackTransport) CloseIdleConnections() {
	t.direct.CloseIdleConnections()
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.proxy != nil {
		t.proxy.CloseIdleConnections()
	}
}
