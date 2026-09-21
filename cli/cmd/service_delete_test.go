package cmd

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
)

func TestServiceDeleteRequiresConfirmation(t *testing.T) {
	for _, tt := range []struct {
		answer      string
		wantDeleted bool
	}{
		{answer: "no", wantDeleted: false},
		{answer: "y", wantDeleted: true},
		{answer: "yes", wantDeleted: true},
	} {
		t.Run(tt.answer, func(t *testing.T) {
			deleted := false
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodDelete {
					deleted = true
				}
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()

			stdin, input, err := os.Pipe()
			if err != nil {
				t.Fatalf("create stdin pipe: %v", err)
			}
			if _, err := input.WriteString(tt.answer + "\n"); err != nil {
				t.Fatalf("write confirmation: %v", err)
			}
			input.Close()
			originalStdin, originalClient, originalNamespace := os.Stdin, apiClient, namespace
			os.Stdin, apiClient, namespace = stdin, api.NewClient(server.URL), "user"
			t.Cleanup(func() { os.Stdin, apiClient, namespace = originalStdin, originalClient, originalNamespace })

			if err := serviceDeleteCmd.RunE(serviceDeleteCmd, []string{"service"}); err != nil {
				t.Fatalf("service delete error = %v", err)
			}
			if deleted != tt.wantDeleted {
				t.Errorf("service deletion = %t, want %t", deleted, tt.wantDeleted)
			}
		})
	}
}

func TestServiceDeleteYesSkipsConfirmation(t *testing.T) {
	deleted := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			deleted = true
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	originalClient, originalNamespace := apiClient, namespace
	apiClient, namespace = api.NewClient(server.URL), "user"
	t.Cleanup(func() { apiClient, namespace = originalClient, originalNamespace })

	if err := serviceDeleteCmd.Flags().Set("yes", "true"); err != nil {
		t.Fatalf("enable --yes: %v", err)
	}
	t.Cleanup(func() { serviceDeleteCmd.Flags().Set("yes", "false") })
	if err := serviceDeleteCmd.RunE(serviceDeleteCmd, []string{"service"}); err != nil {
		t.Fatalf("service delete error = %v", err)
	}
	if !deleted {
		t.Fatal("service was not deleted with --yes")
	}
}
