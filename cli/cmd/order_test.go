package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// fakeOrderAPI is a catalog API that accepts orders and serves their states in
// sequence. Any direct ResourceClaim, Workshop or WorkshopProvision creation
// fails the test: ordering must go through the order API.
type fakeOrderAPI struct {
	t           *testing.T
	catalog     types.CatalogItem
	states      []map[string]interface{} // order view after submit, then one per GET
	submitError int

	mu          sync.Mutex
	submissions []map[string]interface{}
	gets        int
}

const testOrderName = "order-0123456789ab"

func (f *fakeOrderAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	path := r.URL.Path
	switch {
	case r.Method == http.MethodGet && strings.HasSuffix(path, "/catalogitems/"+f.catalog.Metadata.Name):
		_ = json.NewEncoder(w).Encode(f.catalog)
	case r.Method == http.MethodPost && path == "/api/catalog-item-orders":
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			f.t.Errorf("invalid order body: %v", err)
		}
		f.submissions = append(f.submissions, body)
		if f.submitError != 0 {
			w.WriteHeader(f.submitError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_purpose", "message": "purpose must be one of the catalog item purposes"})
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(f.state(0))
	case r.Method == http.MethodGet && path == "/api/catalog-item-orders/test-user/"+testOrderName:
		f.gets++
		_ = json.NewEncoder(w).Encode(f.state(f.gets))
	case r.Method == http.MethodGet && strings.Contains(path, "/resourceclaims/"):
		_ = json.NewEncoder(w).Encode(types.ResourceClaim{
			Kind: "ResourceClaim", Metadata: types.ObjectMeta{Name: "test-item-1a2b3c4d", Namespace: "test-user"},
		})
	case r.Method == http.MethodGet && strings.Contains(path, "/workshops/"):
		_ = json.NewEncoder(w).Encode(types.Workshop{
			Kind: "Workshop", Metadata: types.ObjectMeta{Name: "test-item-1a2b3c4d", Namespace: "test-user"},
		})
	case r.Method == http.MethodPost:
		f.t.Errorf("unexpected direct creation: POST %s", path)
		w.WriteHeader(http.StatusForbidden)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakeOrderAPI) state(i int) map[string]interface{} {
	if i >= len(f.states) {
		i = len(f.states) - 1
	}
	return f.states[i]
}

func (f *fakeOrderAPI) submission(t *testing.T) map[string]interface{} {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.submissions) != 1 {
		t.Fatalf("got %d order submissions, want 1", len(f.submissions))
	}
	return f.submissions[0]
}

func orderState(phase string, extra map[string]interface{}) map[string]interface{} {
	state := map[string]interface{}{
		"name": testOrderName, "namespace": "test-user", "uid": "order-uid", "phase": phase,
		"catalogItem": map[string]string{"name": "test-item", "namespace": "catalog"},
		"approval":    map[string]interface{}{},
	}
	for k, v := range extra {
		state[k] = v
	}
	return state
}

func createdState(kinds ...string) map[string]interface{} {
	var resources []map[string]string
	for _, kind := range kinds {
		resources = append(resources, map[string]string{
			"apiVersion": "v1", "kind": kind, "name": "test-item-1a2b3c4d", "namespace": "test-user", "uid": kind + "-uid",
		})
	}
	return orderState(types.OrderPhaseApproved, map[string]interface{}{
		"approval":    map[string]interface{}{"state": "NotRequired"},
		"completedAt": "2026-11-26T10:00:00Z",
		"attempts":    []map[string]interface{}{{"state": "Created", "resources": resources}},
	})
}

var pendingState = orderState(types.OrderPhasePendingApproval, map[string]interface{}{
	"approval": map[string]interface{}{
		"state": "Pending", "expiresAt": "2026-11-29T10:00:00Z", "reviewUrl": "https://catalog.example.com/approvals/order-uid",
		"manager": map[string]interface{}{"state": "Resolved", "directManager": map[string]string{"email": "dana@example.com", "name": "Dana"}},
	},
	"policy": map[string]interface{}{"matchedRules": []map[string]string{{"id": "large", "reason": "More than 10 seats"}}},
})

func testCatalogItem() types.CatalogItem {
	return types.CatalogItem{
		Metadata: types.ObjectMeta{Name: "test-item", Namespace: "catalog"},
		Spec: types.CatalogItemSpec{Parameters: []types.CatalogItemParameter{
			{Name: "purpose", Required: true, OpenAPIV3Schema: &types.SchemaSpec{Type: "string", Enum: []interface{}{"Development", "Training"}}},
			{Name: "size", OpenAPIV3Schema: &types.SchemaSpec{Type: "string", Default: "small"}},
			{Name: "num_users", OpenAPIV3Schema: &types.SchemaSpec{Type: "integer"}},
		}},
	}
}

// useFakeOrderAPI points the commands at a fake catalog API and restores all
// package state after the test.
func useFakeOrderAPI(t *testing.T, fake *fakeOrderAPI) {
	t.Helper()
	fake.t = t
	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)
	saved := struct {
		client                                        *api.Client
		namespace, output                             string
		params                                        []string
		end, purpose, explanation                     string
		wait, interval                                time.Duration
		wParams                                       []string
		wEnd, wPassword, wDisplay, wPurpose, wExplain string
		wSeats                                        int
		wOpen                                         bool
		wWait                                         time.Duration
	}{apiClient, namespace, outputFormat, orderParams, orderEndDate, orderPurpose, orderExplanation, orderWait, orderPollInterval,
		workshopParams, workshopEndDate, workshopAccessPassword, workshopDisplayName, workshopPurpose, workshopExplanation,
		workshopSeats, workshopOpenRegistration, workshopWait}
	t.Cleanup(func() {
		apiClient, namespace, outputFormat = saved.client, saved.namespace, saved.output
		orderParams, orderEndDate, orderPurpose, orderExplanation = saved.params, saved.end, saved.purpose, saved.explanation
		orderWait, orderPollInterval = saved.wait, saved.interval
		workshopParams, workshopEndDate, workshopAccessPassword, workshopDisplayName = saved.wParams, saved.wEnd, saved.wPassword, saved.wDisplay
		workshopPurpose, workshopExplanation, workshopSeats = saved.wPurpose, saved.wExplain, saved.wSeats
		workshopOpenRegistration, workshopWait = saved.wOpen, saved.wWait
	})
	apiClient = api.NewClient(server.URL)
	apiClient.Session = &types.Session{User: "test-user", CatalogNamespaces: []types.CatalogNamespace{{Name: "catalog"}}}
	namespace, outputFormat = "test-user", "json"
	orderParams, orderEndDate, orderPurpose, orderExplanation = nil, "", "", ""
	orderWait, workshopWait, orderPollInterval = 5*time.Second, 5*time.Second, time.Millisecond
	workshopParams, workshopEndDate, workshopAccessPassword, workshopDisplayName = nil, "", "", ""
	workshopPurpose, workshopExplanation, workshopSeats, workshopOpenRegistration = "", "", 1, false
}

func captureOutput(t *testing.T, fn func() error) (string, error) {
	t.Helper()
	original := os.Stdout
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = write
	done := make(chan string)
	go func() {
		var buf bytes.Buffer
		_, _ = io.Copy(&buf, read)
		done <- buf.String()
	}()
	runErr := fn()
	write.Close()
	os.Stdout = original
	return <-done, runErr
}

func TestServiceOrderSubmitsOrderAndPrintsCreatedClaim(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{
		orderState(types.OrderPhaseSubmitted, nil), createdState("ResourceClaim"),
	}}
	useFakeOrderAPI(t, fake)
	orderParams = []string{"size=large", "num_users=3"}
	orderEndDate = "2099-01-02"

	out, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	var claim types.ResourceClaim
	if err := json.Unmarshal([]byte(out), &claim); err != nil || claim.Kind != "ResourceClaim" || claim.Metadata.Name != "test-item-1a2b3c4d" {
		t.Fatalf("JSON output should be the created ResourceClaim, got %q (%v)", out, err)
	}

	body := fake.submission(t)
	if body["orderType"] != "service" || body["namespace"] != "test-user" || body["purpose"] != "Development" || body["skipSalesforceId"] != true {
		t.Errorf("unexpected submission: %v", body)
	}
	if ref, _ := body["catalogItem"].(map[string]interface{}); ref["name"] != "test-item" || ref["namespace"] != "catalog" {
		t.Errorf("catalogItem = %v", body["catalogItem"])
	}
	// Only explicit parameters are sent, typed; purpose is an order field, and
	// catalog defaults are applied by the API.
	params, _ := body["parameters"].(map[string]interface{})
	if len(params) != 2 || params["size"] != "large" || params["num_users"] != float64(3) {
		t.Errorf("parameters = %v, want only size and num_users", params)
	}
	if schedule, _ := body["schedule"].(map[string]interface{}); schedule["end"] != "2099-01-02T00:00:00Z" {
		t.Errorf("schedule = %v", body["schedule"])
	}
	if key, _ := body["idempotencyKey"].(string); !strings.HasPrefix(key, "cli-") || len(key) < 8 {
		t.Errorf("idempotencyKey = %q", key)
	}
	for _, forbidden := range []string{"requester", "metadata", "spec", "status"} {
		if _, ok := body[forbidden]; ok {
			t.Errorf("submission must not carry %q", forbidden)
		}
	}
}

func TestServiceOrderWithoutEndDateLeavesScheduleToCatalogDefaults(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{createdState("ResourceClaim")}}
	useFakeOrderAPI(t, fake)
	if _, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) }); err != nil {
		t.Fatal(err)
	}
	body := fake.submission(t)
	if _, ok := body["schedule"]; ok {
		t.Errorf("schedule = %v; without --end-date the default lifespan must start when the service is created", body["schedule"])
	}
	if _, ok := body["parameters"]; ok {
		t.Errorf("parameters = %v, want none without --param", body["parameters"])
	}
}

func TestServiceOrderNeedingApprovalReturnsOrderWithoutWaitingForDecision(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{
		orderState(types.OrderPhaseSubmitted, nil), pendingState, createdState("ResourceClaim"),
	}}
	useFakeOrderAPI(t, fake)

	out, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatalf("an order waiting for approval is not an error: %v", err)
	}
	var order map[string]interface{}
	if err := json.Unmarshal([]byte(out), &order); err != nil || order["phase"] != "PendingApproval" || order["name"] != testOrderName {
		t.Fatalf("JSON output should be the pending order, got %q", out)
	}
	if fake.gets != 1 {
		t.Errorf("polled %d times; must stop as soon as approval is required", fake.gets)
	}

	outputFormat = "table"
	fake.gets, fake.submissions = 0, nil
	out, err = captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"needs manager approval", "Dana <dana@example.com>", "More than 10 seats",
		"https://catalog.example.com/approvals/order-uid", "babylon order status " + testOrderName} {
		if !strings.Contains(out, want) {
			t.Errorf("table output missing %q:\n%s", want, out)
		}
	}
}

func TestServiceOrderDeniedOrderFails(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{
		orderState(types.OrderPhaseDenied, map[string]interface{}{
			"approval": map[string]interface{}{"state": "Denied", "decision": map[string]string{"outcome": "Denied", "decidedBy": "dana", "comment": "Too large"}},
		}),
	}}
	useFakeOrderAPI(t, fake)
	_, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err == nil || !strings.Contains(err.Error(), "denied: Too large") {
		t.Fatalf("err = %v, want denial with comment", err)
	}
}

func TestWorkshopCreateDoesNotReportPartiallyCreatedOrder(t *testing.T) {
	partial := createdState("Workshop")
	delete(partial, "completedAt") // Workshop exists, WorkshopProvision not yet
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{partial}}
	useFakeOrderAPI(t, fake)
	workshopWait = 20 * time.Millisecond
	out, err := captureOutput(t, func() error { return workshopCreateCmd.RunE(workshopCreateCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	var top map[string]interface{}
	if err := json.Unmarshal([]byte(out), &top); err != nil || top["phase"] != "Approved" || top["kind"] != nil {
		t.Fatalf("output must be the order while creation is incomplete:\n%s", out)
	}
}

func TestServiceOrderWaitZeroReturnsRightAfterSubmitting(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{
		orderState(types.OrderPhaseSubmitted, nil), createdState("ResourceClaim"),
	}}
	useFakeOrderAPI(t, fake)
	orderWait = 0
	out, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	if fake.gets != 0 || !strings.Contains(out, `"phase": "Submitted"`) {
		t.Fatalf("gets = %d, output = %s; want the submitted order without polling", fake.gets, out)
	}
}

func TestServiceOrderShowsAPIValidationErrors(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), submitError: http.StatusBadRequest}
	useFakeOrderAPI(t, fake)
	_, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
	if err == nil || !strings.Contains(err.Error(), "purpose must be one of the catalog item purposes") {
		t.Fatalf("err = %v", err)
	}
	if len(fake.submissions) != 1 {
		t.Errorf("a 400 must not be resent; got %d submissions", len(fake.submissions))
	}
}

func TestServiceOrderPurpose(t *testing.T) {
	for _, tc := range []struct {
		name         string
		params       []string
		purpose      string
		explanation  string
		defaultValue interface{}
		legacyValue  string
		noParameter  bool
		want         string
		wantExplain  string
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
		{name: "fallback without catalog parameter", noParameter: true, want: "Development"},
		{name: "explanation flag", explanation: "Partner enablement", want: "Development", wantExplain: "Partner enablement"},
		{name: "reserved parameter", params: []string{"salesforce_id=701"}, wantError: "use --purpose"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			catalog := types.CatalogItem{Metadata: types.ObjectMeta{Name: "test-item", Namespace: "catalog"}}
			if !tc.noParameter {
				catalog.Spec.Parameters = []types.CatalogItemParameter{{
					Name: "purpose", Required: true, Value: tc.legacyValue,
					OpenAPIV3Schema: &types.SchemaSpec{Type: "string", Default: tc.defaultValue, Enum: []interface{}{"Development", "Training"}},
				}, {Name: "salesforce_id", OpenAPIV3Schema: &types.SchemaSpec{Type: "string"}}}
			}
			fake := &fakeOrderAPI{catalog: catalog, states: []map[string]interface{}{createdState("ResourceClaim")}}
			useFakeOrderAPI(t, fake)
			orderParams, orderPurpose, orderExplanation = tc.params, tc.purpose, tc.explanation
			_, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) {
					t.Fatalf("got %v, want error containing %q", err, tc.wantError)
				}
				if len(fake.submissions) != 0 {
					t.Error("invalid input submitted an order")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			body := fake.submission(t)
			if body["purpose"] != tc.want {
				t.Errorf("purpose = %v, want %q", body["purpose"], tc.want)
			}
			if got, _ := body["explanation"].(string); got != tc.wantExplain {
				t.Errorf("explanation = %q, want %q", got, tc.wantExplain)
			}
			if params, _ := body["parameters"].(map[string]interface{}); params["purpose"] != nil {
				t.Error("purpose must not be sent as a parameter")
			}
		})
	}
}

func TestOrderPurposeOptions(t *testing.T) {
	catalog := types.CatalogItem{Metadata: types.ObjectMeta{Name: "test-item", Namespace: "catalog"}}
	catalog.Spec.Parameters = []types.CatalogItemParameter{{Name: "purpose", OpenAPIV3Schema: &types.SchemaSpec{
		Type: "string", XFormOptions: []types.PurposeOption{
			{Name: "Training - Internal", Activity: "Internal"},
			{Name: "Other", Activity: "Internal", RequireUserInput: true},
		},
	}}, {Name: "purpose_explanation", OpenAPIV3Schema: &types.SchemaSpec{Type: "string"}}}
	for _, tc := range []struct {
		name        string
		purpose     string
		explanation string
		params      []string
		wantError   string
	}{
		{name: "fallback is not an option", wantError: `needs --purpose set to one of: "Training - Internal", "Other"`},
		{name: "unknown option", purpose: "Development", wantError: "needs --purpose set to one of"},
		{name: "valid option", purpose: "Training - Internal"},
		{name: "option requires explanation", purpose: "Other", wantError: `purpose "Other" requires --explanation`},
		{name: "explanation flag", purpose: "Other", explanation: "Partner enablement"},
		{name: "explanation parameter", purpose: "Other", params: []string{"purpose_explanation=Partner enablement"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fake := &fakeOrderAPI{catalog: catalog, states: []map[string]interface{}{createdState("ResourceClaim")}}
			useFakeOrderAPI(t, fake)
			orderPurpose, orderExplanation, orderParams = tc.purpose, tc.explanation, tc.params
			_, err := captureOutput(t, func() error { return serviceOrderCmd.RunE(serviceOrderCmd, []string{"test-item"}) })
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) || len(fake.submissions) != 0 {
					t.Fatalf("err = %v, submissions = %d; want %q before submitting", err, len(fake.submissions), tc.wantError)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			body := fake.submission(t)
			if body["purpose"] != tc.purpose {
				t.Errorf("purpose = %v", body["purpose"])
			}
			if tc.purpose == "Other" && body["explanation"] != "Partner enablement" {
				t.Errorf("explanation = %v", body["explanation"])
			}
			if params, _ := body["parameters"].(map[string]interface{}); params["purpose_explanation"] != nil {
				t.Error("purpose_explanation must be sent as the order explanation")
			}
		})
	}
}

func TestWorkshopCreateSubmitsWorkshopOrder(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{
		orderState(types.OrderPhaseSubmitted, nil), createdState("Workshop", "WorkshopProvision"),
	}}
	useFakeOrderAPI(t, fake)
	workshopSeats, workshopDisplayName, workshopAccessPassword = 150, "My Workshop", "secret-pass"
	workshopParams = []string{"purpose=Training"}

	out, err := captureOutput(t, func() error { return workshopCreateCmd.RunE(workshopCreateCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	var workshop types.Workshop
	if err := json.Unmarshal([]byte(out), &workshop); err != nil || workshop.Kind != "Workshop" {
		t.Fatalf("JSON output should be the created Workshop, got %q", out)
	}
	body := fake.submission(t)
	if body["orderType"] != "workshop" || body["purpose"] != "Training" {
		t.Errorf("unexpected submission: %v", body)
	}
	options, _ := body["workshop"].(map[string]interface{})
	if options["count"] != float64(150) || options["concurrency"] != float64(100) || options["displayName"] != "My Workshop" ||
		options["accessPassword"] != "secret-pass" || options["openRegistration"] != false {
		t.Errorf("workshop options = %v", options)
	}
	if _, ok := body["parameters"]; ok {
		t.Errorf("parameters = %v; purpose is an order field", body["parameters"])
	}
}

func TestWorkshopCreateShowsGeneratedPasswordOnceCreated(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{createdState("Workshop", "WorkshopProvision")}}
	useFakeOrderAPI(t, fake)
	outputFormat = "table"
	out, err := captureOutput(t, func() error { return workshopCreateCmd.RunE(workshopCreateCmd, []string{"test-item"}) })
	if err != nil {
		t.Fatal(err)
	}
	options, _ := fake.submission(t)["workshop"].(map[string]interface{})
	password, _ := options["accessPassword"].(string)
	if password == "" || !strings.Contains(out, "Password:  "+password) || !strings.Contains(out, "Order:     "+testOrderName) {
		t.Fatalf("generated password %q must be sent and shown:\n%s", password, out)
	}
}

func TestWorkshopCreateRejectsInvalidPurposeBeforeSubmitting(t *testing.T) {
	fake := &fakeOrderAPI{catalog: testCatalogItem(), states: []map[string]interface{}{createdState("Workshop")}}
	useFakeOrderAPI(t, fake)
	workshopParams = []string{"purpose=Invalid"}
	_, err := captureOutput(t, func() error { return workshopCreateCmd.RunE(workshopCreateCmd, []string{"test-item"}) })
	if err == nil || !strings.Contains(err.Error(), "must be one of") || len(fake.submissions) != 0 {
		t.Fatalf("err = %v, submissions = %d", err, len(fake.submissions))
	}
}

func TestOrderStatusAndCancel(t *testing.T) {
	cancelled := orderState(types.OrderPhaseCancelled, nil)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/catalog-item-orders/test-user/"+testOrderName:
			state := orderState(types.OrderPhasePendingApproval, nil)
			for k, v := range pendingState {
				state[k] = v
			}
			state["cancel"] = map[string]interface{}{"allowed": true}
			_ = json.NewEncoder(w).Encode(state)
		case r.Method == http.MethodPost && r.URL.Path == "/api/catalog-item-orders/test-user/"+testOrderName+"/cancel":
			_ = json.NewEncoder(w).Encode(cancelled)
		case r.Method == http.MethodGet && r.URL.Path == "/api/catalog-item-orders":
			if r.URL.Query().Get("namespace") != "" {
				t.Errorf("list without -n must not filter by namespace")
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"items": []interface{}{pendingState}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	useFakeOrderAPI(t, &fakeOrderAPI{catalog: testCatalogItem()})
	apiClient = api.NewClient(server.URL)
	apiClient.Session = &types.Session{User: "test-user"}
	outputFormat = "table"

	out, err := captureOutput(t, func() error { return orderStatusCmd.RunE(orderStatusCmd, []string{testOrderName}) })
	if err != nil || !strings.Contains(out, "Phase:     PendingApproval") || !strings.Contains(out, "babylon order cancel "+testOrderName) {
		t.Fatalf("status: err = %v\n%s", err, out)
	}
	out, err = captureOutput(t, func() error { return orderListCmd.RunE(orderListCmd, nil) })
	if err != nil || !strings.Contains(out, testOrderName) || !strings.Contains(out, "PendingApproval") {
		t.Fatalf("list: err = %v\n%s", err, out)
	}
	out, err = captureOutput(t, func() error { return orderCancelCmd.RunE(orderCancelCmd, []string{testOrderName}) })
	if err != nil || !strings.Contains(out, "cancelled") {
		t.Fatalf("cancel: err = %v\n%s", err, out)
	}
}
