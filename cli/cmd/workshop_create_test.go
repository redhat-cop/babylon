package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func TestWorkshopCreatePurpose(t *testing.T) {
	for _, tc := range []struct {
		name         string
		params       []string
		defaultValue interface{}
		legacyValue  string
		want         string
		wantError    bool
	}{
		{name: "required fallback", want: "Development"},
		{name: "explicit override", params: []string{"purpose=Training"}, want: "Training"},
		{name: "schema default", defaultValue: "Training", want: "Training"},
		{name: "legacy catalog default", legacyValue: "Training", want: "Training"},
		{name: "invalid purpose", params: []string{"purpose=Invalid"}, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			catalog := types.CatalogItem{Metadata: types.ObjectMeta{Name: "test-item", Namespace: "catalog"}}
			catalog.Spec.Parameters = []types.CatalogItemParameter{{
				Name: "purpose", Required: true, Value: tc.legacyValue,
				OpenAPIV3Schema: &types.SchemaSpec{Type: "string", Default: tc.defaultValue, Enum: []interface{}{"Development", "Training"}},
			}}
			var posts atomic.Int32
			purposes := make(chan interface{}, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/catalogitems/test-item"):
					_ = json.NewEncoder(w).Encode(catalog)
				case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/workshops"):
					posts.Add(1)
					var workshop types.Workshop
					if err := json.NewDecoder(r.Body).Decode(&workshop); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					workshop.Metadata.UID = "dummy-uid"
					_ = json.NewEncoder(w).Encode(workshop)
				case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/workshopprovisions"):
					posts.Add(1)
					var provision types.WorkshopProvision
					if err := json.NewDecoder(r.Body).Decode(&provision); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					purposes <- provision.Spec.Parameters["purpose"]
					_ = json.NewEncoder(w).Encode(provision)
				default:
					w.WriteHeader(http.StatusNotFound)
				}
			}))
			defer server.Close()
			originalClient, originalNamespace, originalOutput := apiClient, namespace, outputFormat
			originalParams, originalEnd, originalPassword, originalSeats := workshopParams, workshopEndDate, workshopAccessPassword, workshopSeats
			t.Cleanup(func() {
				apiClient, namespace, outputFormat = originalClient, originalNamespace, originalOutput
				workshopParams, workshopEndDate, workshopAccessPassword, workshopSeats = originalParams, originalEnd, originalPassword, originalSeats
			})
			apiClient = api.NewClient(server.URL)
			apiClient.Session = &types.Session{User: "test-user", CatalogNamespaces: []types.CatalogNamespace{{Name: "catalog"}}}
			namespace, outputFormat = "test-user", "json"
			workshopParams, workshopEndDate, workshopAccessPassword, workshopSeats = tc.params, "2h", "dummy-password", 1
			err := workshopCreateCmd.RunE(workshopCreateCmd, []string{"test-item"})
			if tc.wantError {
				if err == nil || !strings.Contains(err.Error(), "must be one of") || posts.Load() != 0 {
					t.Fatalf("error = %v, posts = %d; want enum validation before creating a workshop", err, posts.Load())
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			select {
			case got := <-purposes:
				if got != tc.want || posts.Load() != 2 {
					t.Fatalf("purpose = %v, posts = %d; want %s and 2", got, posts.Load(), tc.want)
				}
			default:
				t.Fatal("workshop provision was not created")
			}
		})
	}
}
