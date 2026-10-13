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

const workshopTestItem = "tests.test-empty-config.prod"
const workshopTestCatalogNamespace = "babylon-catalog-test"

type workshopHTTPModel struct {
	mu              sync.Mutex
	namespace       string
	workshop        *types.Workshop
	claims          map[string]*types.ResourceClaim
	actions         []string
	provisionDenied bool
	seatFails       bool
	deleteDenied    bool
	provisioned     bool
	claimLists      int
	deletePolls     int
	claimPolls      map[string]int
	watchSnapshots  [][]types.ResourceClaim
}

func (m *workshopHTTPModel) serve(t *testing.T, w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	write := func(value any) { _ = json.NewEncoder(w).Encode(value) }
	cookie, err := r.Cookie("_oauth2_proxy")
	if r.Header.Get("Authentication") != "Bearer test-token" || err != nil || cookie.Value != "test-cookie" {
		w.WriteHeader(http.StatusUnauthorized)
		write(map[string]string{"message": "missing test authentication"})
		return
	}
	workshopsPath := "/apis/" + types.BabylonDomain + "/v1/namespaces/" + m.namespace + "/workshops"
	claimsPath := "/apis/" + types.PoolboyDomain + "/v1/namespaces/" + m.namespace + "/resourceclaims"
	switch {
	case r.URL.Path == "/auth/session":
		write(types.Session{
			Token: "test-token", User: "test-user",
			UserNamespace:     types.UserNamespace{Name: "test-user"},
			CatalogNamespaces: []types.CatalogNamespace{{Name: workshopTestCatalogNamespace}},
		})
	case r.Method == http.MethodGet && r.URL.Path == "/apis/"+types.BabylonDomain+"/v1/namespaces/"+workshopTestCatalogNamespace+"/catalogitems/"+workshopTestItem:
		write(types.CatalogItem{
			Metadata: types.ObjectMeta{Name: workshopTestItem, Namespace: workshopTestCatalogNamespace},
			Spec: types.CatalogItemSpec{WorkshopUserMode: "none", Parameters: []types.CatalogItemParameter{{
				Name: "purpose", Required: true, OpenAPIV3Schema: &types.SchemaSpec{Type: "string"},
			}}},
		})
	case r.URL.Path == workshopsPath && r.Method == http.MethodPost:
		m.workshop = &types.Workshop{}
		if err := json.NewDecoder(r.Body).Decode(m.workshop); err != nil {
			t.Errorf("decode workshop: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if m.workshop.Metadata.Namespace != m.namespace || m.workshop.Spec.AccessPassword == "" ||
			m.workshop.Spec.Lifespan == nil || m.workshop.Spec.MultiuserServices || m.workshop.Spec.OpenRegistration {
			t.Error("create did not use the expected workshop settings")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		end, err := time.Parse(time.RFC3339, m.workshop.Spec.Lifespan.End)
		if err != nil || time.Until(end) < 119*time.Minute || time.Until(end) > 121*time.Minute {
			t.Error("create did not use a two-hour lifespan")
		}
		m.workshop.Metadata.UID = "workshop-uid"
		m.workshop.Metadata.CreationTimestamp = time.Now().UTC().Format(time.RFC3339)
		m.actions = append(m.actions, "create")
		w.WriteHeader(http.StatusCreated)
		write(m.workshop)
	case r.Method == http.MethodPost && r.URL.Path == workshopsPath[:len(workshopsPath)-len("workshops")]+"workshopprovisions":
		m.actions = append(m.actions, "provision")
		if m.provisionDenied {
			w.WriteHeader(http.StatusForbidden)
			write(map[string]string{"message": "provision denied"})
			return
		}
		var provision types.WorkshopProvision
		if err := json.NewDecoder(r.Body).Decode(&provision); err != nil || m.workshop == nil {
			t.Error("invalid workshop provision")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if provision.Spec.Count != 2 || provision.Spec.Concurrency != 2 || provision.Spec.WorkshopName != m.workshop.Metadata.Name ||
			provision.Spec.Parameters["purpose"] != "Development" ||
			provision.Spec.CatalogItem.Name != workshopTestItem || provision.Spec.CatalogItem.Namespace != workshopTestCatalogNamespace ||
			len(provision.Metadata.OwnerReferences) != 1 || provision.Metadata.OwnerReferences[0].UID != m.workshop.Metadata.UID ||
			provision.Metadata.OwnerReferences[0].Controller == nil || !*provision.Metadata.OwnerReferences[0].Controller {
			t.Error("provision has incorrect seats, defaults, catalog, or ownership")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		m.provisioned = true
		m.workshop.Status = &types.WorkshopStatus{ProvisionCount: &types.WorkshopProvisionCount{Ordered: 2}}
		m.claims["seat-1"] = workshopTestSeat(m.namespace, m.workshop.Metadata.Name, "seat-1", "provisioning")
		m.claimPolls["seat-1"] = 1
		if m.seatFails {
			m.workshop.Status.ProvisionCount.Failed = 1
		}
		w.WriteHeader(http.StatusCreated)
		write(provision)
	case r.URL.Path == workshopsPath && r.Method == http.MethodGet:
		items := []types.Workshop{}
		if m.workshop != nil {
			items = append(items, *m.workshop)
		}
		write(types.WorkshopList{Items: items})
	case m.workshop != nil && r.URL.Path == workshopsPath+"/"+m.workshop.Metadata.Name:
		switch r.Method {
		case http.MethodGet:
			if m.workshop.Metadata.DeletionTimestamp != "" {
				if m.deletePolls == 0 {
					m.workshop = nil
					w.WriteHeader(http.StatusNotFound)
					write(map[string]string{"message": "workshop not found"})
					return
				}
				m.deletePolls--
			}
			if len(m.watchSnapshots) > 0 && m.claimLists == 0 {
				initial := *m.workshop
				initial.Status = nil
				write(initial)
				return
			}
			write(m.workshop)
		case http.MethodDelete:
			m.actions = append(m.actions, "delete")
			if m.deleteDenied {
				w.WriteHeader(http.StatusForbidden)
				write(map[string]string{"message": "delete denied"})
				return
			}
			m.workshop.Metadata.DeletionTimestamp = time.Now().UTC().Format(time.RFC3339)
			m.deletePolls = 1
			for name, claim := range m.claims {
				if claim.Metadata.Labels[types.BabylonDomain+"/workshop"] == m.workshop.Metadata.Name {
					claim.Metadata.DeletionTimestamp = m.workshop.Metadata.DeletionTimestamp
					claim.Status.Summary.State = "destroying"
					m.claimPolls[name] = 1
				}
			}
			write(map[string]string{"status": "Success"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	case r.URL.Path == claimsPath && r.Method == http.MethodGet:
		selector := r.URL.Query().Get("labelSelector")
		if selector != "" && (m.workshop == nil || selector != types.BabylonDomain+"/workshop="+m.workshop.Metadata.Name) {
			t.Errorf("unexpected workshop selector %q", selector)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		items := []types.ResourceClaim{}
		if selector != "" {
			m.claimLists++
			if len(m.watchSnapshots) > 0 {
				index := min(m.claimLists-1, len(m.watchSnapshots)-1)
				write(types.ResourceClaimList{Items: m.watchSnapshots[index]})
				return
			}
			if m.provisioned && m.claimLists >= 2 && m.workshop.Metadata.DeletionTimestamp == "" && m.claims["seat-2"] == nil {
				m.claims["seat-2"] = workshopTestSeat(m.namespace, m.workshop.Metadata.Name, "seat-2", "provisioning")
				m.claimPolls["seat-2"] = 1
			}
		}
		for _, claim := range m.claims {
			if selector == "" || claim.Metadata.Labels[types.BabylonDomain+"/workshop"] == m.workshop.Metadata.Name {
				items = append(items, *claim)
			}
		}
		write(types.ResourceClaimList{Items: items})
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, claimsPath+"/"):
		name := strings.TrimPrefix(r.URL.Path, claimsPath+"/")
		claim := m.claims[name]
		if claim == nil {
			w.WriteHeader(http.StatusNotFound)
			write(map[string]string{"message": "resourceclaim not found"})
			return
		}
		if m.claimPolls[name] > 0 {
			m.claimPolls[name]--
		} else if claim.Metadata.DeletionTimestamp != "" {
			delete(m.claims, name)
			w.WriteHeader(http.StatusNotFound)
			write(map[string]string{"message": "resourceclaim not found"})
			return
		} else {
			claim.Status.Summary.State = "started"
		}
		write(claim)
	default:
		w.WriteHeader(http.StatusNotFound)
		write(map[string]string{"message": "workshop not found"})
	}
}

func workshopTestSeat(namespace, workshop, name, state string) *types.ResourceClaim {
	return &types.ResourceClaim{
		Metadata: types.ObjectMeta{Name: name, Namespace: namespace, UID: name + "-uid",
			Labels: map[string]string{types.BabylonDomain + "/workshop": workshop}},
		Status: &types.ResourceClaimStatus{Summary: &types.ResourceClaimSummary{State: state}},
	}
}

func workshopHTTPRunner(t *testing.T, binary string, model *workshopHTTPModel) cliRunner {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { model.serve(t, w, r) }))
	t.Cleanup(server.Close)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := config.Save(configPath, &config.Config{Server: server.URL,
		Auth: config.Auth{Token: "test-token", Cookies: map[string]string{"_oauth2_proxy": "test-cookie"}}}); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BABYLON_SERVER", "http://unused.invalid")
	t.Setenv("BABYLON_NAMESPACE", "wrong-namespace")
	return cliRunner{binary: binary, config: configPath, commandTimeout: 10 * time.Second}
}

func TestCLIWorkshopLifecycleAgainstHTTPServer(t *testing.T) {
	binary := buildCLI(t)
	for _, tc := range []struct {
		name            string
		namespace       string
		provisionDenied bool
		seatFails       bool
		deleteDenied    bool
		cancel          bool
		wantError       string
	}{
		{name: "complete lifecycle", namespace: "test-user"},
		{name: "explicit namespace", namespace: "workshop-team"},
		{name: "cleanup after provisioning failure", namespace: "test-user", seatFails: true, wantError: "failed provisions"},
		{name: "cleanup after partial creation", namespace: "test-user", provisionDenied: true, wantError: "API error 403: provision denied"},
		{name: "cleanup after cancellation", namespace: "test-user", cancel: true, wantError: "context canceled"},
		{name: "reports cleanup failure", namespace: "test-user", deleteDenied: true, wantError: "cleanup of workshop"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			model := &workshopHTTPModel{namespace: tc.namespace, provisionDenied: tc.provisionDenied,
				seatFails: tc.seatFails, deleteDenied: tc.deleteDenied, claims: map[string]*types.ResourceClaim{
					"unrelated": workshopTestSeat(tc.namespace, "another-workshop", "unrelated", "started"),
				}, claimPolls: make(map[string]int)}
			runner := workshopHTTPRunner(t, binary, model)
			options := lifecycleOptions{catalogItem: workshopTestItem, stepTimeout: 10 * time.Second, pollInterval: time.Millisecond}
			if tc.namespace != "test-user" {
				options.serviceNamespace = tc.namespace
			}
			ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
			defer cancel()
			canceled := false
			run := func(commandCtx context.Context, format string, args ...string) ([]byte, error) {
				if tc.cancel && !canceled && args[0] == "workshop" && args[1] == "status" {
					canceled = true
					cancel()
					return nil, ctx.Err()
				}
				return runner.run(commandCtx, format, args...)
			}
			err := runWorkshopLifecycle(ctx, run, options, 2, t.Logf)
			if tc.wantError == "" && err != nil {
				t.Fatal(err)
			}
			if tc.wantError != "" && (err == nil || !strings.Contains(err.Error(), tc.wantError)) {
				t.Fatalf("error = %v, want %q", err, tc.wantError)
			}
			model.mu.Lock()
			defer model.mu.Unlock()
			wantActions := []string{"create", "provision", "delete"}
			if tc.deleteDenied {
				wantActions = append(wantActions, "delete")
			} else if model.workshop != nil || len(model.claims) != 1 {
				t.Error("workshop or seat claims survived cleanup")
			}
			if !reflect.DeepEqual(model.actions, wantActions) {
				t.Errorf("actions = %v, want %v", model.actions, wantActions)
			}
			if model.claims["unrelated"] == nil || model.claims["unrelated"].Metadata.DeletionTimestamp != "" {
				t.Error("cleanup touched an unrelated service")
			}
		})
	}
}

func TestCLIWorkshopWatchWaitsForAllSeats(t *testing.T) {
	const namespace = "test-user"
	const name = "watch-workshop"
	ready := workshopTestSeat(namespace, name, "seat-1", "started")
	pending := workshopTestSeat(namespace, name, "seat-2", "provisioning")
	// The first underlying resource is started, but the aggregate is not ready.
	pending.Status.Resources = []types.ResourceHandleResource{{State: &types.AnarchySubject{
		Spec: types.AnarchySubjectSpec{Vars: &types.AnarchySubjectVars{CurrentState: "started"}},
	}}}
	secondReady := workshopTestSeat(namespace, name, "seat-2", "started")
	deleting := workshopTestSeat(namespace, name, "old-seat", "started")
	deleting.Metadata.DeletionTimestamp = time.Now().UTC().Format(time.RFC3339)
	tenant := workshopTestSeat(namespace, name, "tenant-cluster", "started")
	tenant.Metadata.Labels[types.BabylonDomain+"/tenant-cluster-pool"] = "shared"
	model := &workshopHTTPModel{
		namespace: namespace,
		workshop: &types.Workshop{Metadata: types.ObjectMeta{Name: name, Namespace: namespace, UID: "watch-uid"},
			Status: &types.WorkshopStatus{ProvisionCount: &types.WorkshopProvisionCount{Ordered: 2}}},
		watchSnapshots: [][]types.ResourceClaim{
			{}, {*ready}, {*ready, *pending}, {*ready, *secondReady, *deleting, *tenant},
		},
	}
	runner := workshopHTTPRunner(t, buildCLI(t), model)
	var snapshot workshopSnapshot
	if err := readJSON(t.Context(), runner.run, &snapshot, workshopArgs("status", name, namespace, "--watch", "--interval", "1")...); err != nil {
		t.Fatal(err)
	}
	if err := checkWorkshopSnapshot(&snapshot, model.workshop, []types.ResourceClaim{*ready, *secondReady}); err != nil {
		t.Fatal(err)
	}
	model.mu.Lock()
	defer model.mu.Unlock()
	if model.claimLists != len(model.watchSnapshots) {
		t.Fatalf("watch finished after %d polls; want %d", model.claimLists, len(model.watchSnapshots))
	}
}
