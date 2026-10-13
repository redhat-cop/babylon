package functional

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/config"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// Exercise the same lifecycle runner with real CLI subprocesses, without cloud access.
func TestCLIServiceLifecycleAgainstHTTPServer(t *testing.T) {
	binary := buildCLI(t)
	for _, stopForbidden := range []bool{false, true} {
		name := "complete lifecycle"
		if stopForbidden {
			name = "cleanup after forbidden stop"
		}
		t.Run(name, func(t *testing.T) {
			const namespace = "test-user"
			const catalogNamespace = "babylon-catalog-test"
			const item = "tests.test-empty-config.prod"
			claimsPath := "/apis/" + types.PoolboyDomain + "/v1/namespaces/" + namespace + "/resourceclaims"
			catalogPath := "/apis/" + types.BabylonDomain + "/v1/namespaces/" + catalogNamespace + "/catalogitems/" + item
			var mu sync.Mutex
			var claim *types.ResourceClaim
			var actions []string
			pendingPolls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				write := func(value any) { _ = json.NewEncoder(w).Encode(value) }
				cookie, err := r.Cookie("_oauth2_proxy")
				if r.Header.Get("Authentication") != "Bearer test-token" || err != nil || cookie.Value != "test-cookie" {
					w.WriteHeader(http.StatusUnauthorized)
					write(map[string]string{"message": "missing test authentication"})
					return
				}
				switch {
				case r.URL.Path == "/auth/session":
					write(types.Session{
						Token: "test-token", User: "test-user",
						UserNamespace:     types.UserNamespace{Name: namespace},
						CatalogNamespaces: []types.CatalogNamespace{{Name: catalogNamespace}},
					})
				case r.Method == http.MethodGet && r.URL.Path == catalogPath:
					write(types.CatalogItem{
						Metadata: types.ObjectMeta{Name: item, Namespace: catalogNamespace},
						Spec: types.CatalogItemSpec{Parameters: []types.CatalogItemParameter{{
							Name: "purpose", Required: true, OpenAPIV3Schema: &types.SchemaSpec{Type: "string"},
						}}},
					})
				case r.Method == http.MethodPost && r.URL.Path == claimsPath:
					claim = &types.ResourceClaim{}
					if err := json.NewDecoder(r.Body).Decode(claim); err != nil {
						t.Errorf("decode order: %v", err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					if claim.Spec.Provider == nil || claim.Spec.Provider.ParameterValues["purpose"] != "Development" {
						t.Error("order did not use the default purpose")
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					claim.Metadata.UID = "test-uid"
					claim.Status = &types.ResourceClaimStatus{Summary: &types.ResourceClaimSummary{State: "provisioning"}}
					pendingPolls = 1
					actions = append(actions, "order")
					w.WriteHeader(http.StatusCreated)
					write(claim)
				case r.Method == http.MethodGet && r.URL.Path == claimsPath:
					items := []types.ResourceClaim{}
					if claim != nil {
						items = append(items, *claim)
					}
					write(types.ResourceClaimList{Items: items})
				case claim != nil && r.URL.Path == claimsPath+"/"+claim.Metadata.Name:
					switch r.Method {
					case http.MethodGet:
						if pendingPolls > 0 {
							pendingPolls--
						} else {
							switch claim.Status.Summary.State {
							case "provisioning", "starting":
								claim.Status.Summary.State = "started"
							case "stopping":
								claim.Status.Summary.State = "stopped"
							case "destroying":
								claim = nil
								w.WriteHeader(http.StatusNotFound)
								write(map[string]string{"message": "resourceclaim not found"})
								return
							}
						}
						write(claim)
					case http.MethodPatch:
						var patch types.ResourceClaim
						if err := json.NewDecoder(r.Body).Decode(&patch); err != nil || patch.Spec.Provider == nil {
							t.Error("invalid lifecycle patch")
							w.WriteHeader(http.StatusBadRequest)
							return
						}
						params := patch.Spec.Provider.ParameterValues
						if _, ok := params["start_timestamp"]; ok {
							actions = append(actions, "start")
							claim.Status.Summary.State = "starting"
						} else if _, ok := params["stop_timestamp"]; ok {
							actions = append(actions, "stop")
							if stopForbidden {
								w.WriteHeader(http.StatusForbidden)
								write(map[string]string{"message": "stop denied"})
								return
							}
							claim.Status.Summary.State = "stopping"
						} else {
							t.Error("lifecycle patch has no action timestamps")
							w.WriteHeader(http.StatusBadRequest)
							return
						}
						pendingPolls = 1
						write(claim)
					case http.MethodDelete:
						actions = append(actions, "delete")
						claim.Metadata.DeletionTimestamp = time.Now().UTC().Format(time.RFC3339)
						claim.Status.Summary.State = "destroying"
						pendingPolls = 1
						write(map[string]string{"status": "Success"})
					default:
						w.WriteHeader(http.StatusMethodNotAllowed)
					}
				default:
					w.WriteHeader(http.StatusNotFound)
					write(map[string]string{"message": "resourceclaim not found"})
				}
			}))
			defer server.Close()
			configPath := filepath.Join(t.TempDir(), "config.yaml")
			if err := config.Save(configPath, &config.Config{
				Server: server.URL,
				Auth:   config.Auth{Token: "test-token", Cookies: map[string]string{"_oauth2_proxy": "test-cookie"}},
			}); err != nil {
				t.Fatal(err)
			}
			// The login config must take precedence over unrelated ambient CLI settings.
			t.Setenv("BABYLON_SERVER", "http://unused.invalid")
			t.Setenv("BABYLON_NAMESPACE", "wrong-namespace")
			runner := cliRunner{binary: binary, config: configPath, commandTimeout: 5 * time.Second}
			ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
			defer cancel()
			err := runLifecycle(ctx, runner.run, lifecycleOptions{
				catalogItem: item, stepTimeout: 10 * time.Second, pollInterval: time.Millisecond,
			}, t.Logf)
			wantActions := []string{"order", "stop", "start", "delete"}
			if stopForbidden {
				wantActions = []string{"order", "stop", "delete"}
				if err == nil || !strings.Contains(err.Error(), "API error 403: stop denied") {
					t.Errorf("expected forbidden stop: %v", err)
				}
			} else if err != nil {
				t.Fatal(err)
			}
			mu.Lock()
			defer mu.Unlock()
			if !reflect.DeepEqual(actions, wantActions) {
				t.Errorf("actions = %v, want %v", actions, wantActions)
			}
			if claim != nil {
				t.Error("test service was not deleted")
			}
		})
	}
}
