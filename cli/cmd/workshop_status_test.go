package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"gopkg.in/yaml.v3"
)

func TestWorkshopStatusWatchRejectsIntervalsBelowOneSecond(t *testing.T) {
	originalClient, originalWatch, originalInterval := apiClient, workshopStatusWatch, workshopStatusInterval
	apiClient, workshopStatusWatch, workshopStatusInterval = api.NewClient("http://127.0.0.1"), true, 0
	t.Cleanup(func() {
		apiClient, workshopStatusWatch, workshopStatusInterval = originalClient, originalWatch, originalInterval
	})

	err := workshopStatusCmd.RunE(workshopStatusCmd, []string{"workshop"})
	if err == nil || !strings.Contains(err.Error(), "at least 1 second") {
		t.Fatalf("workshop status error = %v, want interval validation error", err)
	}
}

func TestWorkshopStatusWatchUsesStructuredOutputWhenReady(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/workshops/"):
			io.WriteString(w, `{"metadata":{"name":"workshop","namespace":"user","creationTimestamp":"2026-09-21T00:00:00Z"}}`)
		case strings.Contains(r.URL.Path, "/resourceclaims"):
			io.WriteString(w, `{"items":[{"metadata":{"name":"seat","creationTimestamp":"2026-09-21T00:00:00Z"},"status":{"summary":{"state":"started"}}}]}`)
		default:
			t.Fatalf("unexpected request path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	for _, format := range []string{"json", "yaml"} {
		t.Run(format, func(t *testing.T) {
			stdout, output, err := os.Pipe()
			if err != nil {
				t.Fatalf("create stdout pipe: %v", err)
			}
			originalStdout, originalClient, originalNamespace := os.Stdout, apiClient, namespace
			originalWatch, originalInterval, originalFormat := workshopStatusWatch, workshopStatusInterval, outputFormat
			os.Stdout, apiClient, namespace = output, api.NewClient(server.URL), "user"
			workshopStatusWatch, workshopStatusInterval, outputFormat = true, 1, format

			err = workshopStatusCmd.RunE(workshopStatusCmd, []string{"workshop"})
			output.Close()
			data, readErr := io.ReadAll(stdout)
			stdout.Close()
			os.Stdout, apiClient, namespace = originalStdout, originalClient, originalNamespace
			workshopStatusWatch, workshopStatusInterval, outputFormat = originalWatch, originalInterval, originalFormat
			if err != nil {
				t.Fatalf("workshop status error = %v", err)
			}
			if readErr != nil {
				t.Fatalf("read output: %v", readErr)
			}

			var dataOutput workshopStatusData
			if format == "json" {
				err = json.Unmarshal(data, &dataOutput)
			} else {
				err = yaml.Unmarshal(data, &dataOutput)
			}
			if err != nil {
				t.Fatalf("parse %s output %q: %v", format, data, err)
			}
			if dataOutput.Workshop == nil || dataOutput.Workshop.Metadata.Name != "workshop" {
				t.Fatalf("workshop output = %#v, want workshop data", dataOutput)
			}
		})
	}
}
