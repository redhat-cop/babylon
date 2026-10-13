package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func TestServiceOrderPurpose(t *testing.T) {
	for _, tc := range []struct {
		name         string
		params       []string
		purpose      string
		defaultValue interface{}
		legacyValue  string
		noParameter  bool
		want         string
		wantError    string
	}{
		{name: "defaults required purpose", want: "Development"},
		{name: "flag satisfies required purpose", purpose: "Training", want: "Training"},
		{name: "parameter overrides fallback", params: []string{"purpose=Training"}, want: "Training"},
		{name: "flag overrides parameter", params: []string{"purpose=Development"}, purpose: "Training", want: "Training"},
		{name: "preserves catalog default", defaultValue: "Training", want: "Training"},
		{name: "preserves legacy catalog value", legacyValue: "Training", want: "Training"},
		{name: "validates flag against enum", defaultValue: "Development", purpose: "Invalid", wantError: `parameter "purpose" must be one of`},
		{name: "purpose without catalog parameter", noParameter: true, purpose: "Training", want: "Training"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			catalog := types.CatalogItem{Metadata: types.ObjectMeta{Name: "test-item", Namespace: "test-catalog"}}
			if !tc.noParameter {
				catalog.Spec.Parameters = []types.CatalogItemParameter{{
					Name: "purpose", Required: true, Value: tc.legacyValue,
					OpenAPIV3Schema: &types.SchemaSpec{
						Type: "string", Default: tc.defaultValue, Enum: []interface{}{"Development", "Training"},
					},
				}}
			}
			ordered := make(chan interface{}, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch {
				case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/catalogitems/test-item"):
					_ = json.NewEncoder(w).Encode(catalog)
				case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/resourceclaims"):
					var claim types.ResourceClaim
					if err := json.NewDecoder(r.Body).Decode(&claim); err != nil || claim.Spec.Provider == nil {
						t.Error("invalid order request")
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					ordered <- claim.Spec.Provider.ParameterValues["purpose"]
					w.WriteHeader(http.StatusCreated)
					_ = json.NewEncoder(w).Encode(claim)
				default:
					w.WriteHeader(http.StatusNotFound)
				}
			}))
			defer server.Close()
			originalClient, originalNamespace, originalOutput := apiClient, namespace, outputFormat
			originalParams, originalPurpose, originalEndDate := orderParams, orderPurpose, orderEndDate
			t.Cleanup(func() {
				apiClient, namespace, outputFormat = originalClient, originalNamespace, originalOutput
				orderParams, orderPurpose, orderEndDate = originalParams, originalPurpose, originalEndDate
			})
			apiClient = api.NewClient(server.URL)
			apiClient.Session = &types.Session{User: "test-user", CatalogNamespaces: []types.CatalogNamespace{{Name: "test-catalog"}}}
			namespace, outputFormat = "test-user", "json"
			orderParams, orderPurpose, orderEndDate = tc.params, tc.purpose, "2h"
			err := serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"})
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) {
					t.Fatalf("got %v, want error containing %q", err, tc.wantError)
				}
				select {
				case <-ordered:
					t.Error("invalid purpose created a service")
				default:
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			select {
			case got := <-ordered:
				if got != tc.want {
					t.Errorf("ordered purpose = %v, want %q", got, tc.want)
				}
			default:
				t.Error("service was not ordered")
			}
		})
	}
}
