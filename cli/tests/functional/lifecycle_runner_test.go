package functional

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func TestLifecycleRunner(t *testing.T) {
	for _, tc := range []struct {
		name         string
		stopFails    bool
		cancel       bool
		cleanupFails bool
		wantError    []string
		wantActions  []string
	}{
		{name: "complete lifecycle", wantActions: []string{"order", "stop", "start", "delete"}},
		{name: "cleanup after stop failure", stopFails: true, wantError: []string{"stop failed"}, wantActions: []string{"order", "stop", "delete"}},
		{name: "cleanup after cancellation", cancel: true, wantError: []string{"context canceled"}, wantActions: []string{"order", "stop", "delete"}},
		{name: "reports cleanup failure", stopFails: true, cleanupFails: true, wantError: []string{"stop failed", "API error 403"}, wantActions: []string{"order", "stop", "delete"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			var actions []string
			state := "started"
			deleted := false
			item := "tests.test-empty-config.prod"
			claim := func() *types.ResourceClaim {
				rc := claimWithState(state)
				rc.Metadata.Labels = map[string]string{
					types.BabylonDomain + "/catalogItemName":      item,
					types.BabylonDomain + "/catalogItemNamespace": "babylon-catalog-test",
				}
				rc.Spec.Provider = &types.ResourceClaimProvider{Name: item}
				return rc
			}
			marshal := func(value any) ([]byte, error) { return json.Marshal(value) }
			run := func(commandCtx context.Context, format string, args ...string) ([]byte, error) {
				if err := commandCtx.Err(); err != nil {
					return nil, err
				}
				if args[0] == "catalog" {
					return marshal(&types.CatalogItem{Metadata: types.ObjectMeta{Name: item, Namespace: "babylon-catalog-test"}})
				}
				action := args[1]
				if action == "order" || action == "stop" || action == "start" || action == "delete" {
					actions = append(actions, action)
				}
				switch action {
				case "order":
					return marshal(claim())
				case "stop":
					if tc.cancel {
						cancel()
						return nil, ctx.Err()
					}
					if tc.stopFails {
						return nil, fmt.Errorf("stop failed")
					}
					state = "stopped"
					return marshal(claim())
				case "start":
					state = "started"
					return marshal(claim())
				case "delete":
					if tc.cleanupFails {
						return nil, &commandError{stderr: "Error: API error 403: delete denied"}
					}
					deleted = true
					return []byte("Service deleted.\n"), nil
				case "list":
					claims := []*types.ResourceClaim{}
					if !deleted {
						claims = append(claims, claim())
					}
					return marshal(claims)
				case "status":
					if deleted {
						return nil, &commandError{stderr: "Error: API error 404: resourceclaim not found"}
					}
					switch format {
					case "table":
						return []byte(fmt.Sprintf("Name:        test-service\nState:       %s\n", state)), nil
					case "yaml":
						return yaml.Marshal(claim())
					default:
						return marshal(claim())
					}
				}
				return nil, fmt.Errorf("unexpected command: %v", args)
			}
			err := runLifecycle(ctx, run, lifecycleOptions{
				catalogItem: item, stepTimeout: time.Second, pollInterval: time.Millisecond,
			}, t.Logf)
			if len(tc.wantError) == 0 && err != nil {
				t.Fatal(err)
			}
			for _, text := range tc.wantError {
				if err == nil || !strings.Contains(err.Error(), text) {
					t.Errorf("got %v, want error containing %q", err, text)
				}
			}
			if !reflect.DeepEqual(actions, tc.wantActions) {
				t.Errorf("actions = %v, want %v", actions, tc.wantActions)
			}
			if !tc.cleanupFails && !deleted {
				t.Error("test service was not cleaned up")
			}
		})
	}
}
