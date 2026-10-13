package functional

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func claimWithState(state string) *types.ResourceClaim {
	return &types.ResourceClaim{
		Metadata: types.ObjectMeta{Name: "test-service", Namespace: "test-user", UID: "test-uid"},
		Status: &types.ResourceClaimStatus{
			Summary: &types.ResourceClaimSummary{State: state},
		},
	}
}

func TestWaitForState(t *testing.T) {
	t.Run("waits through provisioning and missing status", func(t *testing.T) {
		claims := []*types.ResourceClaim{
			{}, claimWithState("provisioning"), claimWithState("started"),
		}
		calls := 0
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			claim := claims[calls]
			calls++
			return claim, nil
		}
		if err := waitForState(t.Context(), "test-service", "started", time.Millisecond, fetch, t.Logf); err != nil {
			t.Fatal(err)
		}
		if calls != len(claims) {
			t.Fatalf("polled %d times, want %d", calls, len(claims))
		}
	})

	t.Run("reports lifecycle failure immediately", func(t *testing.T) {
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			claim := claimWithState("stop-failed")
			claim.Status.Summary.ErrorMessage = "deployer stop failed"
			return claim, nil
		}
		err := waitForState(t.Context(), "test-service", "stopped", time.Millisecond, fetch, nil)
		if err == nil || !strings.Contains(err.Error(), "stop-failed") || !strings.Contains(err.Error(), "deployer stop failed") {
			t.Fatalf("missing failure diagnostics: %v", err)
		}
	})

	t.Run("does not accept a stale successful summary over a failed resource", func(t *testing.T) {
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			claim := claimWithState("started")
			claim.Status.Resources = []types.ResourceHandleResource{{
				State: &types.AnarchySubject{Spec: types.AnarchySubjectSpec{
					Vars: &types.AnarchySubjectVars{CurrentState: "provision-failed"},
				}},
			}}
			return claim, nil
		}
		err := waitForState(t.Context(), "test-service", "started", time.Millisecond, fetch, nil)
		if err == nil || !strings.Contains(err.Error(), "provision-failed") {
			t.Fatalf("accepted failed resource: %v", err)
		}
	})

	t.Run("timeout includes the last observed state", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			cancel()
			return claimWithState("starting"), nil
		}
		err := waitForState(ctx, "test-service", "started", time.Hour, fetch, nil)
		if !errors.Is(err, context.Canceled) || !strings.Contains(err.Error(), "starting") {
			t.Fatalf("missing cancellation/state diagnostics: %v", err)
		}
	})

	t.Run("command errors fail the wait", func(t *testing.T) {
		want := errors.New("invalid status JSON")
		fetch := func(context.Context) (*types.ResourceClaim, error) { return nil, want }
		err := waitForState(t.Context(), "test-service", "started", time.Millisecond, fetch, nil)
		if !errors.Is(err, want) {
			t.Fatalf("got %v, want %v", err, want)
		}
	})
}

func TestWaitForDeletion(t *testing.T) {
	t.Run("waits for not found rather than the deletion timestamp", func(t *testing.T) {
		calls := 0
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			calls++
			if calls == 1 {
				claim := claimWithState("destroying")
				claim.Metadata.DeletionTimestamp = "2026-10-13T00:00:00Z"
				return claim, nil
			}
			return nil, &commandError{stderr: "Error: API error 404: resourceclaims not found\nUsage: babylon service status"}
		}
		if err := waitForDeletion(t.Context(), "test-service", time.Millisecond, fetch); err != nil {
			t.Fatal(err)
		}
		if calls != 2 {
			t.Fatalf("polled %d times, want 2", calls)
		}
	})

	for _, stderr := range []string{
		"Error: API error 403: forbidden",
		"Error: session expired (run 'babylon login'): fetching session: API error 404: not found",
		"Error: cannot reach Babylon API",
	} {
		t.Run(stderr, func(t *testing.T) {
			want := &commandError{stderr: stderr}
			fetch := func(context.Context) (*types.ResourceClaim, error) { return nil, want }
			if err := waitForDeletion(t.Context(), "test-service", time.Millisecond, fetch); !errors.Is(err, want) {
				t.Fatalf("treated command error as successful deletion: %v", err)
			}
		})
	}

	t.Run("times out when the claim remains", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		fetch := func(context.Context) (*types.ResourceClaim, error) {
			cancel()
			return claimWithState("destroying"), nil
		}
		if err := waitForDeletion(ctx, "test-service", time.Hour, fetch); !errors.Is(err, context.Canceled) {
			t.Fatalf("accepted an existing claim: %v", err)
		}
	})
}
