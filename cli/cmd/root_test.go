package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRootNormalizesServerURL(t *testing.T) {
	for _, source := range []string{"flag", "environment", "config", "trailing slash"} {
		t.Run(source, func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				if r.URL.Path != "/auth/session" {
					t.Errorf("path = %q, want /auth/session", r.URL.Path)
				}
				fmt.Fprint(w, `{"token":"dummy-session","lifetime":600,"userNamespace":{"name":"test-user"}}`)
			}))
			defer server.Close()
			originalFile, originalServer, originalNamespace, originalOutput := cfgFile, serverURL, namespace, outputFormat
			originalConfig, originalClient := cfg, apiClient
			t.Cleanup(func() {
				cfgFile, serverURL, namespace, outputFormat = originalFile, originalServer, originalNamespace, originalOutput
				cfg, apiClient = originalConfig, originalClient
			})
			t.Setenv("BABYLON_SERVER", "")
			t.Setenv("BABYLON_NAMESPACE", "")
			host := strings.TrimPrefix(server.URL, "https://")
			configuredURL := server.URL
			serverURL, namespace, outputFormat = "", "", ""
			switch source {
			case "flag":
				serverURL = host
			case "environment":
				t.Setenv("BABYLON_SERVER", host)
			case "config":
				configuredURL = host
			case "trailing slash":
				serverURL = server.URL + "/"
			}
			data, err := json.Marshal(map[string]interface{}{
				"server": configuredURL, "insecure": true,
				"auth": map[string]interface{}{"token": "dummy-token", "cookies": map[string]string{"__oauth_proxy_test": "dummy-cookie"}},
			})
			if err != nil {
				t.Fatal(err)
			}
			cfgFile = filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(cfgFile, data, 0600); err != nil {
				t.Fatal(err)
			}
			if err := rootCmd.PersistentPreRunE(serviceListCmd, nil); err != nil {
				t.Fatal(err)
			}
			if apiClient.BaseURL != server.URL || namespace != "test-user" || requests.Load() != 1 {
				t.Fatalf("server = %q, namespace = %q, requests = %d", apiClient.BaseURL, namespace, requests.Load())
			}
		})
	}
}
