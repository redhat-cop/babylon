package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestCrossOriginRedirectDoesNotForwardCredentials(t *testing.T) {
	const token = "dummy-bearer-token"
	const cookieValue = "dummy-oauth-cookie"

	var receivedAuthentication, receivedAuthorization, receivedCookie string
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuthentication = r.Header.Get("Authentication")
		receivedAuthorization = r.Header.Get("Authorization")
		receivedCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer destination.Close()

	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL, http.StatusFound)
	}))
	defer source.Close()

	client := NewClient(source.URL)
	client.Token = token
	client.Cookies = map[string]string{"_oauth2_proxy": cookieValue}
	if _, err := client.get("/start"); err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if receivedAuthentication != "" {
		t.Errorf("cross-origin redirect received Authentication header %q", receivedAuthentication)
	}
	if receivedAuthorization != "" {
		t.Errorf("cross-origin redirect received Authorization header %q", receivedAuthorization)
	}
	if receivedCookie != "" {
		t.Errorf("cross-origin redirect received Cookie header %q", receivedCookie)
	}
}

func TestCrossOriginRedirectChainDoesNotForwardCredentials(t *testing.T) {
	const token = "dummy-bearer-token"
	const cookieValue = "dummy-oauth-cookie"

	var receivedAuthentication, receivedCookie string
	destination := httptest.NewServer(nil)
	defer destination.Close()
	destination.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/first" {
			http.Redirect(w, r, "/second", http.StatusFound)
			return
		}
		receivedAuthentication = r.Header.Get("Authentication")
		receivedCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusNoContent)
	})

	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL+"/first", http.StatusFound)
	}))
	defer source.Close()

	client := NewClient(source.URL)
	client.Token = token
	client.Cookies = map[string]string{"_oauth2_proxy": cookieValue}
	if _, err := client.get("/start"); err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if receivedAuthentication != "" || receivedCookie != "" {
		t.Fatalf("cross-origin redirect chain received credentials: Authentication=%q Cookie=%q", receivedAuthentication, receivedCookie)
	}
}

func TestCrossOriginRedirectDoesNotUpdateBaseURL(t *testing.T) {
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer destination.Close()

	var sourceRequests int
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sourceRequests++
		if r.URL.Path == "/first" {
			http.Redirect(w, r, destination.URL, http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer source.Close()

	client := NewClient(source.URL)
	if _, err := client.get("/first"); err != nil {
		t.Fatalf("first request failed: %v", err)
	}
	if client.BaseURL != source.URL {
		t.Fatalf("BaseURL = %q, want original %q", client.BaseURL, source.URL)
	}
	if _, err := client.get("/second"); err != nil {
		t.Fatalf("second request failed: %v", err)
	}
	if sourceRequests != 2 {
		t.Fatalf("source requests = %d, want 2", sourceRequests)
	}
}

func TestRequestDoesNotModifySharedRedirectPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewClient(server.URL)
	if _, err := client.get("/start"); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if client.HTTPClient.CheckRedirect != nil {
		t.Fatal("request modified the shared HTTP client's redirect policy")
	}
}

func TestSameOriginRedirectForwardsCredentials(t *testing.T) {
	const token = "dummy-bearer-token"
	const cookieValue = "dummy-oauth-cookie"

	server := httptest.NewServer(nil)
	defer server.Close()
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/target", http.StatusFound)
			return
		}

		if got := r.Header.Get("Authentication"); got != "Bearer "+token {
			t.Errorf("Authentication header = %q, want bearer token", got)
		}
		cookie, err := r.Cookie("_oauth2_proxy")
		if err != nil {
			t.Fatalf("OAuth cookie missing: %v", err)
		}
		if cookie.Value != cookieValue {
			t.Errorf("OAuth cookie = %q, want %q", cookie.Value, cookieValue)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	client := NewClient(server.URL)
	client.Token = token
	client.Cookies = map[string]string{"_oauth2_proxy": cookieValue}
	if _, err := client.get("/start"); err != nil {
		t.Fatalf("request failed: %v", err)
	}
}

func TestHTTPSRedirectToHTTPIsRejected(t *testing.T) {
	const locationSecret = "dummy-location-token"
	var destinationCalled bool
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		destinationCalled = true
		w.WriteHeader(http.StatusNoContent)
	}))
	defer destination.Close()

	source := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL+"?token="+locationSecret, http.StatusFound)
	}))
	defer source.Close()

	client := NewClient(source.URL)
	client.SetInsecureSkipVerify(true)
	if _, err := client.get("/start"); err == nil {
		t.Fatal("HTTPS-to-HTTP redirect succeeded, want error")
	} else if strings.Contains(err.Error(), locationSecret) {
		t.Fatalf("redirect error exposed location secret: %v", err)
	}
	if destinationCalled {
		t.Fatal("HTTP redirect target received a request")
	}
}

func TestDebugDoesNotExposeAuthenticationSecrets(t *testing.T) {
	const token = "dummy-bearer-token"
	const cookieValue = "dummy-oauth-cookie"
	const sessionBody = `{"session":"dummy-session-body"}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Set-Cookie", "_oauth2_proxy="+cookieValue+"; Path=/; HttpOnly")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(sessionBody))
	}))
	defer server.Close()

	stderr, err := os.CreateTemp(t.TempDir(), "stderr")
	if err != nil {
		t.Fatalf("creating stderr capture: %v", err)
	}
	originalStderr := os.Stderr
	os.Stderr = stderr
	t.Cleanup(func() {
		os.Stderr = originalStderr
		_ = stderr.Close()
	})

	client := NewClient(server.URL)
	client.Debug = true
	client.Token = token
	client.Cookies = map[string]string{"_oauth2_proxy": cookieValue}
	if _, err := client.get("/auth/session"); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if err := stderr.Close(); err != nil {
		t.Fatalf("closing stderr capture: %v", err)
	}

	output, err := os.ReadFile(stderr.Name())
	if err != nil {
		t.Fatalf("reading stderr capture: %v", err)
	}
	for _, secret := range []string{token, cookieValue, sessionBody} {
		if strings.Contains(string(output), secret) {
			t.Errorf("debug output exposed %q: %s", secret, output)
		}
	}
}

func TestDebugDoesNotExposeRedirectLocationOrRedirectedSession(t *testing.T) {
	const locationSecret = "dummy-location-token"
	const sessionSecret = "dummy-redirected-session"

	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"session":"` + sessionSecret + `"}`))
	}))
	defer destination.Close()

	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL+"?token="+locationSecret, http.StatusFound)
	}))
	defer source.Close()

	stderr, err := os.CreateTemp(t.TempDir(), "stderr")
	if err != nil {
		t.Fatalf("creating stderr capture: %v", err)
	}
	originalStderr := os.Stderr
	os.Stderr = stderr
	t.Cleanup(func() {
		os.Stderr = originalStderr
		_ = stderr.Close()
	})

	client := NewClient(source.URL)
	client.Debug = true
	if _, err := client.get("/auth/session"); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if err := stderr.Close(); err != nil {
		t.Fatalf("closing stderr capture: %v", err)
	}

	output, err := os.ReadFile(stderr.Name())
	if err != nil {
		t.Fatalf("reading stderr capture: %v", err)
	}
	for _, secret := range []string{locationSecret, sessionSecret} {
		if strings.Contains(string(output), secret) {
			t.Errorf("debug output exposed %q: %s", secret, output)
		}
	}
}

func TestDebugDoesNotExposeResponseBodies(t *testing.T) {
	const provisionSecret = "dummy-provision-secret"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"provision_data":{"password":"` + provisionSecret + `"}}`))
	}))
	defer server.Close()

	stderr, err := os.CreateTemp(t.TempDir(), "stderr")
	if err != nil {
		t.Fatalf("creating stderr capture: %v", err)
	}
	originalStderr := os.Stderr
	os.Stderr = stderr
	t.Cleanup(func() {
		os.Stderr = originalStderr
		_ = stderr.Close()
	})

	client := NewClient(server.URL)
	client.Debug = true
	if _, err := client.get("/resourceclaims/example"); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if err := stderr.Close(); err != nil {
		t.Fatalf("closing stderr capture: %v", err)
	}

	output, err := os.ReadFile(stderr.Name())
	if err != nil {
		t.Fatalf("reading stderr capture: %v", err)
	}
	if strings.Contains(string(output), provisionSecret) {
		t.Errorf("debug output exposed response body: %s", output)
	}
	if !strings.Contains(string(output), "Response: 200") {
		t.Errorf("debug output omitted response diagnostics: %s", output)
	}
}
