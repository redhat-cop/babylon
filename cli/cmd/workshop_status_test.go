package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
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
			io.WriteString(w, `{"metadata":{"name":"workshop","namespace":"user","creationTimestamp":"2026-09-21T00:00:00Z"},"status":{"provisionCount":{"ordered":1}}}`)
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

func TestWorkshopStatusWatchWaitsForEveryOrderedSeat(t *testing.T) {
	for _, initialCount := range []string{`"status":{"provisionCount":{"ordered":2}}`, `"status":{}`} {
		t.Run(initialCount, func(t *testing.T) {
			var polls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.Contains(r.URL.Path, "/workshops/") {
					if polls.Load() == 0 {
						fmt.Fprintf(w, `{"metadata":{"name":"workshop"},%s}`, initialCount)
					} else {
						fmt.Fprint(w, `{"metadata":{"name":"workshop"},"status":{"provisionCount":{"ordered":2}}}`)
					}
					return
				}
				if strings.Contains(r.URL.Path, "/resourceclaims") {
					seat := `{"metadata":{"name":"seat"},"status":{"summary":{"state":"started"}}}`
					if polls.Add(1) == 1 {
						fmt.Fprintf(w, `{"items":[%s]}`, seat)
					} else {
						fmt.Fprintf(w, `{"items":[%s,%s]}`, seat, seat)
					}
					return
				}
				w.WriteHeader(http.StatusNotFound)
			}))
			defer server.Close()
			originalClient, originalNamespace, originalInterval, originalOutput := apiClient, namespace, workshopStatusInterval, outputFormat
			t.Cleanup(func() {
				apiClient, namespace, workshopStatusInterval, outputFormat = originalClient, originalNamespace, originalInterval, originalOutput
			})
			apiClient, namespace, workshopStatusInterval, outputFormat = api.NewClient(server.URL), "user", 1, "json"
			if err := watchWorkshopStatus("workshop"); err != nil {
				t.Fatal(err)
			}
			if got := polls.Load(); got != 2 {
				t.Fatalf("polls = %d, want to wait for the second seat and the ordered count", got)
			}
		})
	}
}

func TestWorkshopStatusDisplaysOrderedSeatCount(t *testing.T) {
	ws := &types.Workshop{Status: &types.WorkshopStatus{ProvisionCount: &types.WorkshopProvisionCount{Ordered: 10}}}
	var service types.ResourceClaim
	if err := json.Unmarshal([]byte(`{"status":{"summary":{"state":"started"}}}`), &service); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	deleting, tenant := service, service
	deleting.Metadata.DeletionTimestamp = "2026-10-13T00:00:00Z"
	tenant.Metadata.Labels = map[string]string{types.BabylonDomain + "/tenant-cluster-pool": "pool"}
	printWorkshopStatus(&output, ws, []types.ResourceClaim{service, deleting, tenant}, nil)
	if !strings.Contains(output.String(), "1/10 ready") {
		t.Fatalf("output = %s, want 1/10 ready", output.String())
	}
}

func TestSeatStateRequiresEveryResourceToBeReady(t *testing.T) {
	for _, tc := range []struct {
		name, status, want string
	}{
		{"aggregate failure", `{"summary":{"state":"provision-failed"},"resources":[{"state":{"spec":{"vars":{"current_state":"started"}}}}]}`, "provision-failed"},
		{"failed second resource", `{"resources":[{"state":{"spec":{"vars":{"current_state":"started"}}}},{"state":{"spec":{"vars":{"current_state":"provision-failed"}}}}]}`, "provision-failed"},
		{"pending second resource", `{"resources":[{"state":{"spec":{"vars":{"current_state":"started"}}}},{}]}`, "pending"},
		{"all started", `{"resources":[{"state":{"spec":{"vars":{"current_state":"started"}}}},{"state":{"spec":{"vars":{"current_state":"started"}}}}]}`, "started"},
		{"no resources", `{}`, "pending"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var svc types.ResourceClaim
			if err := json.Unmarshal([]byte(`{"status":`+tc.status+`}`), &svc); err != nil {
				t.Fatal(err)
			}
			if got := seatState(&svc); got != tc.want {
				t.Fatalf("state = %q, want %q", got, tc.want)
			}
		})
	}
}
