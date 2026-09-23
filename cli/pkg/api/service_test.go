package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func TestStartResourceClaimLegacyPatchesResourceActionSchedules(t *testing.T) {
	claim := legacyResourceClaim()
	var patch map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(claim)
		case http.MethodPatch:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(body, &patch); err != nil {
				t.Fatal(err)
			}
			json.NewEncoder(w).Encode(claim)
		default:
			t.Errorf("unexpected request method %s", r.Method)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	if _, err := client.StartResourceClaim("user", "legacy"); err != nil {
		t.Fatal(err)
	}

	actionSchedule := resourceActionSchedule(t, patch, 0)
	if actionSchedule["start"] == "" || actionSchedule["stop"] == "" {
		t.Fatalf("expected start and stop action schedule values, got %#v", actionSchedule)
	}
	if _, ok := patch["spec"].(map[string]interface{})["provider"]; ok {
		t.Fatalf("legacy claim must not use provider parameter patch: %#v", patch)
	}
	unsupportedSchedule := resourceActionSchedule(t, patch, 1)
	if unsupportedSchedule["start"] != "2026-01-01T00:00:00Z" || unsupportedSchedule["stop"] != "2026-01-01T04:00:00Z" {
		t.Fatalf("unsupported resource schedule changed: %#v", unsupportedSchedule)
	}
}

func TestStopResourceClaimLegacyPatchesResourceActionSchedules(t *testing.T) {
	claim := legacyResourceClaim()
	var patch map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(claim)
		case http.MethodPatch:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(body, &patch); err != nil {
				t.Fatal(err)
			}
			json.NewEncoder(w).Encode(claim)
		default:
			t.Errorf("unexpected request method %s", r.Method)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	if _, err := client.StopResourceClaim("user", "legacy"); err != nil {
		t.Fatal(err)
	}

	actionSchedule := resourceActionSchedule(t, patch, 0)
	if actionSchedule["stop"] == "" {
		t.Fatalf("expected stop action schedule value, got %#v", actionSchedule)
	}
	if actionSchedule["start"] != "2026-01-01T00:00:00Z" {
		t.Fatalf("stop must not change the start action schedule: %#v", actionSchedule)
	}
	unsupportedSchedule := resourceActionSchedule(t, patch, 1)
	if unsupportedSchedule["stop"] != "2026-01-01T04:00:00Z" {
		t.Fatalf("unsupported resource schedule changed: %#v", unsupportedSchedule)
	}
}

func TestStartResourceClaimProviderBackedPatchesProviderParameters(t *testing.T) {
	claim := types.ResourceClaim{
		Metadata: types.ObjectMeta{Name: "provider", Namespace: "user"},
		Spec:     types.ResourceClaimSpec{Provider: &types.ResourceClaimProvider{}},
	}
	var patch map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(claim)
		case http.MethodPatch:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(body, &patch); err != nil {
				t.Fatal(err)
			}
			json.NewEncoder(w).Encode(claim)
		default:
			t.Errorf("unexpected request method %s", r.Method)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	if _, err := client.StartResourceClaim("user", "provider"); err != nil {
		t.Fatal(err)
	}

	provider := patch["spec"].(map[string]interface{})["provider"].(map[string]interface{})
	parameters := provider["parameterValues"].(map[string]interface{})
	if parameters["start_timestamp"] == "" || parameters["stop_timestamp"] == "" {
		t.Fatalf("expected provider start and stop timestamps, got %#v", parameters)
	}
}

func TestStopResourceClaimProviderBackedPatchesProviderParametersWithoutSummary(t *testing.T) {
	claim := types.ResourceClaim{
		Metadata: types.ObjectMeta{Name: "provider", Namespace: "user"},
		Spec:     types.ResourceClaimSpec{Provider: &types.ResourceClaimProvider{}},
	}
	var patch map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(claim)
		case http.MethodPatch:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(body, &patch); err != nil {
				t.Fatal(err)
			}
			json.NewEncoder(w).Encode(claim)
		default:
			t.Errorf("unexpected request method %s", r.Method)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	if _, err := client.StopResourceClaim("user", "provider"); err != nil {
		t.Fatal(err)
	}

	provider := patch["spec"].(map[string]interface{})["provider"].(map[string]interface{})
	parameters := provider["parameterValues"].(map[string]interface{})
	if parameters["stop_timestamp"] == "" {
		t.Fatalf("expected provider stop timestamp, got %#v", parameters)
	}
}

func TestOrderServiceCopiesCatalogSupportLinkAnnotation(t *testing.T) {
	var servicePayload map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected request method %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&servicePayload); err != nil {
			t.Fatal(err)
		}
		json.NewEncoder(w).Encode(types.ResourceClaim{})
	}))
	defer server.Close()

	catalogItem := &types.CatalogItem{}
	if err := json.Unmarshal([]byte(`{
		"metadata":{"name":"catalog","namespace":"catalog","labels":{}},
		"spec":{"supportLink":"https://example.com/support"}
	}`), catalogItem); err != nil {
		t.Fatal(err)
	}
	client := NewClient(server.URL)
	client.Session = &types.Session{User: "user"}

	if _, err := client.OrderService(catalogItem, "user", nil, time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}

	annotations := servicePayload["metadata"].(map[string]interface{})["annotations"].(map[string]interface{})
	if annotations[types.BabylonDomain+"/support-link"] != "https://example.com/support" {
		t.Fatalf("expected support link annotation, got %#v", annotations)
	}
}

func legacyResourceClaim() types.ResourceClaim {
	template := json.RawMessage(`{"spec":{"vars":{"action_schedule":{"start":"2026-01-01T00:00:00Z","stop":"2026-01-01T04:00:00Z"}}}}`)
	return types.ResourceClaim{
		Metadata: types.ObjectMeta{Name: "legacy", Namespace: "user"},
		Spec: types.ResourceClaimSpec{Resources: []types.ResourceClaimResource{
			{Name: "managed", Template: template},
			{Name: "unsupported", Template: template},
		}},
		Status: &types.ResourceClaimStatus{Resources: []types.ResourceHandleResource{
			{Name: "managed", State: &types.AnarchySubject{Status: &types.AnarchySubjectStatus{SupportedActions: map[string]interface{}{"start": map[string]interface{}{}, "stop": map[string]interface{}{}}}}},
			{Name: "unsupported", State: &types.AnarchySubject{Status: &types.AnarchySubjectStatus{SupportedActions: map[string]interface{}{}}}},
		}},
	}
}

func resourceActionSchedule(t *testing.T, patch map[string]interface{}, index int) map[string]interface{} {
	t.Helper()
	spec, ok := patch["spec"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected full spec patch, got %#v", patch)
	}
	resources, ok := spec["resources"].([]interface{})
	if !ok || len(resources) <= index {
		t.Fatalf("expected resource templates in patch, got %#v", spec)
	}
	resource, ok := resources[index].(map[string]interface{})
	if !ok {
		t.Fatalf("expected resource template, got %#v", resources[index])
	}
	template, ok := resource["template"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected resource template, got %#v", resource)
	}
	templateSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected template spec, got %#v", template)
	}
	vars, ok := templateSpec["vars"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected template vars, got %#v", templateSpec)
	}
	actionSchedule, ok := vars["action_schedule"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected action schedule, got %#v", vars)
	}
	return actionSchedule
}
