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

func TestCreateWorkshopCopiesCatalogLifespanGuardrailsAndLabUIRedirect(t *testing.T) {
	var workshopPayload map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		switch r.URL.Path {
		case "/apis/babylon.gpte.redhat.com/v1/namespaces/user/workshops":
			if err := json.Unmarshal(body, &workshopPayload); err != nil {
				t.Fatal(err)
			}
			json.NewEncoder(w).Encode(types.Workshop{Metadata: types.ObjectMeta{Name: "workshop", UID: "uid"}})
		case "/apis/babylon.gpte.redhat.com/v1/namespaces/user/workshopprovisions":
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected request path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	client.Session = &types.Session{User: "user"}
	catalogItem := &types.CatalogItem{}
	if err := json.Unmarshal([]byte(`{
		"metadata":{"name":"catalog","namespace":"catalog","labels":{}},
		"spec":{
			"lifespan":{"maximum":"14d","relativeMaximum":"7d"},
			"workshopLabUiRedirect":true,
			"supportLink":"https://example.com/support"
		}
	}`), catalogItem); err != nil {
		t.Fatal(err)
	}

	if _, err := client.CreateWorkshop(catalogItem, "user", 1, "", "", false, time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC), nil); err != nil {
		t.Fatal(err)
	}

	spec := workshopPayload["spec"].(map[string]interface{})
	lifespan := spec["lifespan"].(map[string]interface{})
	if lifespan["maximum"] != "14d" || lifespan["relativeMaximum"] != "7d" {
		t.Fatalf("expected lifespan guardrails, got %#v", lifespan)
	}
	redirect := spec["labUserInterface"].(map[string]interface{})
	if redirect["redirect"] != true {
		t.Fatalf("expected lab UI redirect, got %#v", redirect)
	}
	annotations := workshopPayload["metadata"].(map[string]interface{})["annotations"].(map[string]interface{})
	if annotations[types.BabylonDomain+"/support-link"] != "https://example.com/support" {
		t.Fatalf("expected support link annotation, got %#v", annotations)
	}
}
