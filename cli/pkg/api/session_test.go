package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRequestRenewsExpiredSession(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth/session" {
			requests++
			fmt.Fprint(w, `{"token":"new-session","lifetime":600}`)
			return
		}
		if r.Header.Get("Authentication") != "Bearer new-session" {
			t.Error("resource request used an expired session")
		}
		fmt.Fprint(w, `{}`)
	}))
	defer server.Close()
	client := NewClient(server.URL)
	if _, err := client.parseSessionFromData([]byte(`{"token":"old-session","lifetime":1}`)); err != nil {
		t.Fatal(err)
	}
	if err := client.EnsureSession(); err != nil {
		t.Fatal(err)
	}
	if requests != 0 {
		t.Fatal("valid session was unnecessarily renewed")
	}
	time.Sleep(1100 * time.Millisecond)
	if _, err := client.get("/resource"); err != nil {
		t.Fatal(err)
	}
	if requests != 1 || client.Token != "new-session" {
		t.Fatalf("requests = %d, token = %q; want one renewal and new-session", requests, client.Token)
	}
}

func TestRequestRenewsRejectedSessionAndReplaysBody(t *testing.T) {
	for _, rejectRenewed := range []bool{false, true} {
		t.Run(fmt.Sprintf("reject renewed %t", rejectRenewed), func(t *testing.T) {
			sessions, requests := 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/auth/session" {
					sessions++
					cookie, err := r.Cookie("__oauth_proxy_test")
					if err != nil || cookie.Value != "dummy-cookie" {
						t.Error("session renewal did not retain the OAuth cookie")
					}
					fmt.Fprint(w, `{"token":"new-session","lifetime":600}`)
					return
				}
				requests++
				var body map[string]string
				if r.Method != http.MethodPatch || json.NewDecoder(r.Body).Decode(&body) != nil || body["value"] != "test" {
					t.Error("request method or body was not preserved")
				}
				if r.Header.Get("Authentication") != "Bearer new-session" || rejectRenewed {
					w.WriteHeader(http.StatusUnauthorized)
					fmt.Fprint(w, `{"message":"expired"}`)
					return
				}
				fmt.Fprint(w, `{"ok":true}`)
			}))
			defer server.Close()
			client := NewClient(server.URL)
			client.Cookies = map[string]string{"__oauth_proxy_test": "dummy-cookie"}
			if _, err := client.parseSessionFromData([]byte(`{"token":"old-session","lifetime":600}`)); err != nil {
				t.Fatal(err)
			}
			data, err := client.patch("/resource", map[string]string{"value": "test"})
			if rejectRenewed {
				if err == nil || !strings.Contains(err.Error(), "401") {
					t.Fatalf("error = %v, want unauthorized error", err)
				}
			} else if err != nil || string(data) != `{"ok":true}` {
				t.Fatalf("response = %s, error = %v", data, err)
			}
			if sessions != 1 || requests != 2 {
				t.Fatalf("sessions = %d, requests = %d; want one renewal and two requests", sessions, requests)
			}
		})
	}
}

func TestSessionRenewalFailureIsNotRetried(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"message":"login required"}`)
	}))
	defer server.Close()
	client := NewClient(server.URL)
	if _, err := client.GetSession(); err == nil {
		t.Fatal("unauthorized session request succeeded")
	}
	if requests != 1 {
		t.Fatalf("session requests = %d, want 1", requests)
	}
}
