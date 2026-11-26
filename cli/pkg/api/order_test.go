package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func withFastSubmitRetries(t *testing.T) {
	t.Helper()
	original := submitRetryDelay
	submitRetryDelay = time.Millisecond
	t.Cleanup(func() { submitRetryDelay = original })
}

func TestSubmitOrderResendsSameKeyAfterGatewayError(t *testing.T) {
	withFastSubmitRetries(t)
	var calls atomic.Int32
	keys := make(chan string, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body types.OrderSubmission
		_ = json.NewDecoder(r.Body).Decode(&body)
		keys <- body.IdempotencyKey
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK) // idempotent replay of the first, possibly recorded, submission
		_, _ = w.Write([]byte(`{"name":"order-abc","namespace":"user","phase":"Submitted"}`))
	}))
	defer server.Close()

	order, err := NewClient(server.URL).SubmitOrder(&types.OrderSubmission{IdempotencyKey: "cli-key-123"})
	if err != nil {
		t.Fatal(err)
	}
	if order.Name != "order-abc" || calls.Load() != 2 {
		t.Fatalf("order = %+v, calls = %d", order, calls.Load())
	}
	if first, second := <-keys, <-keys; first != "cli-key-123" || second != first {
		t.Errorf("resubmission must reuse the idempotency key: %q, %q", first, second)
	}
}

func TestSubmitOrderDoesNotResendRejectedOrders(t *testing.T) {
	withFastSubmitRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"idempotency_key_conflict","message":"Idempotency key reused with a different request"}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL).SubmitOrder(&types.OrderSubmission{IdempotencyKey: "cli-key-123"})
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.Code != "idempotency_key_conflict" || apiErr.Message == "" || calls.Load() != 1 {
		t.Fatalf("err = %#v, calls = %d", err, calls.Load())
	}
}

func TestSubmitOrderRequiresIdempotencyKey(t *testing.T) {
	if _, err := NewClient("http://unused.invalid").SubmitOrder(&types.OrderSubmission{}); err == nil {
		t.Fatal("a submission without an idempotency key must not be sent")
	}
}

func TestNewIdempotencyKeyMatchesAPIFormat(t *testing.T) {
	a, err := NewIdempotencyKey()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewIdempotencyKey()
	if a == b || len(a) < 8 || len(a) > 128 {
		t.Fatalf("keys %q, %q", a, b)
	}
	for _, r := range a {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			t.Fatalf("key %q has character %q outside the API's allowed set", a, r)
		}
	}
}

func TestWaitForOrderStopsWhenApprovalIsRequired(t *testing.T) {
	var gets atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		phase := "Submitted"
		if gets.Add(1) >= 2 {
			phase = "PendingApproval"
		}
		_, _ = w.Write([]byte(`{"name":"order-abc","namespace":"user","phase":"` + phase + `"}`))
	}))
	defer server.Close()

	start := &types.CatalogItemOrder{Name: "order-abc", Namespace: "user", Phase: "Submitted"}
	order, err := NewClient(server.URL).WaitForOrder(context.Background(), start, 5*time.Second, time.Millisecond)
	if err != nil || order.Phase != "PendingApproval" || gets.Load() != 2 {
		t.Fatalf("order = %+v, err = %v, gets = %d", order, err, gets.Load())
	}
}

func TestWaitForOrderGivesUpAtTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Approved but its resources are not created yet.
		_, _ = w.Write([]byte(`{"name":"order-abc","namespace":"user","phase":"Approved"}`))
	}))
	defer server.Close()

	start := &types.CatalogItemOrder{Name: "order-abc", Namespace: "user", Phase: "Submitted"}
	began := time.Now()
	order, err := NewClient(server.URL).WaitForOrder(context.Background(), start, 50*time.Millisecond, 5*time.Millisecond)
	if err != nil || order.Phase != "Approved" || time.Since(began) > 2*time.Second {
		t.Fatalf("order = %+v, err = %v, took %v", order, err, time.Since(began))
	}
}

func TestOrderFinalAndCreatedResource(t *testing.T) {
	created := &types.CatalogItemOrder{Phase: "Approved", CompletedAt: "2026-11-26T10:00:00Z", Attempts: []types.OrderAttempt{{
		Resources: []types.ObjectReference{
			{Kind: "Workshop", Name: "planned-only"}, // no uid: not created yet
			{Kind: "Workshop", Name: "ws", UID: "uid-1"},
		},
	}}}
	if !created.Final() || created.CreatedResource("Workshop").Name != "ws" || created.CreatedResource("ResourceClaim") != nil {
		t.Fatalf("unexpected: final=%v", created.Final())
	}
	recoverable := &types.CatalogItemOrder{Phase: "Blocked", Blocked: &types.OrderBlocked{Recoverable: true}}
	if recoverable.Final() {
		t.Error("a recoverable block resumes on its own")
	}
	if (&types.CatalogItemOrder{Phase: "Approved"}).Final() {
		t.Error("an approved order without completedAt is still creating resources")
	}
}
