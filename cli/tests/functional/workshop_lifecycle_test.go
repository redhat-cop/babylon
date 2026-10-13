package functional

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

type workshopSnapshot struct {
	Workshop types.Workshop        `json:"workshop" yaml:"workshop"`
	Services []types.ResourceClaim `json:"services" yaml:"services"`
}

func TestWorkshopLifecycle(t *testing.T) {
	runner, options := functionalSetup(t)
	if err := runWorkshopLifecycle(t.Context(), runner.run, options, 2, t.Logf); err != nil {
		t.Fatal(err)
	}
}

func runWorkshopLifecycle(ctx context.Context, run cliCommand, options lifecycleOptions, seats int, logf func(string, ...any)) (err error) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	var catalog types.CatalogItem
	if err := readJSON(ctx, run, &catalog, "catalog", "describe", options.catalogItem); err != nil {
		return err
	}
	if catalog.Metadata.Name != options.catalogItem || catalog.Metadata.Namespace == "" {
		return fmt.Errorf("catalog describe returned an unexpected item identity")
	}
	var created types.Workshop
	var claims []types.ResourceClaim
	cleaned := false
	displayName := "CLI functional test " + rand.Text()
	defer func() {
		if cleaned || created.Metadata.Name == "" || created.Metadata.Namespace == "" {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.Background(), options.stepTimeout)
		defer cancel()
		logf("Cleaning up workshop %s/%s", created.Metadata.Namespace, created.Metadata.Name)
		if cleanupErr := destroyWorkshop(cleanupCtx, run, &created, claims, options.pollInterval); cleanupErr != nil {
			err = errors.Join(err, fmt.Errorf("cleanup of workshop %s/%s failed: %w", created.Metadata.Namespace, created.Metadata.Name, cleanupErr))
		}
	}()
	args := workshopArgs("create", options.catalogItem, options.serviceNamespace,
		"--seats", strconv.Itoa(seats), "--end-date", "2h", "--display-name", displayName)
	if err := readJSON(ctx, run, &created, args...); err != nil {
		// A Workshop can exist even when creating its WorkshopProvision failed.
		// Recover only this invocation's unique display name and catalog identity.
		if strings.Contains(err.Error(), "created but provision failed") {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), options.stepTimeout)
			defer cancel()
			var workshops []types.Workshop
			if lookupErr := readJSON(cleanupCtx, run, &workshops, workshopArgs("list", "", options.serviceNamespace)...); lookupErr != nil {
				return errors.Join(err, fmt.Errorf("locate partially created workshop: %w", lookupErr))
			}
			for _, ws := range workshops {
				if ws.Spec.DisplayName == displayName &&
					ws.Metadata.Labels[types.BabylonDomain+"/catalogItemName"] == catalog.Metadata.Name &&
					ws.Metadata.Labels[types.BabylonDomain+"/catalogItemNamespace"] == catalog.Metadata.Namespace {
					created = ws
					break
				}
			}
			if created.Metadata.Name == "" || created.Metadata.Namespace == "" {
				return errors.Join(err, fmt.Errorf("could not locate partially created workshop for cleanup"))
			}
		}
		return err
	}
	if created.Metadata.Name == "" || created.Metadata.Namespace == "" || created.Metadata.UID == "" {
		return fmt.Errorf("create response did not include the workshop name, namespace, and UID")
	}
	logf("Created workshop %s/%s with %d seats", created.Metadata.Namespace, created.Metadata.Name, seats)
	if created.Spec.DisplayName != displayName || created.Spec.AccessPassword == "" ||
		created.Spec.Lifespan == nil || created.Spec.Lifespan.End == "" ||
		created.Metadata.Labels[types.BabylonDomain+"/catalogItemName"] != catalog.Metadata.Name ||
		created.Metadata.Labels[types.BabylonDomain+"/catalogItemNamespace"] != catalog.Metadata.Namespace {
		return fmt.Errorf("created workshop has incorrect settings or CatalogItem labels")
	}
	if err := checkWorkshopList(ctx, run, &created, true); err != nil {
		return err
	}
	waitCtx, cancel := context.WithTimeout(ctx, options.stepTimeout)
	claims, err = waitForWorkshopSeats(waitCtx, run, &created, seats, options.pollInterval, logf)
	if err == nil {
		for _, claim := range claims {
			fetch := func(ctx context.Context) (*types.ResourceClaim, error) {
				var current types.ResourceClaim
				if err := readJSON(ctx, run, &current, serviceArgs("status", claim.Metadata.Name, claim.Metadata.Namespace)...); err != nil {
					return nil, err
				}
				return &current, checkIdentity(&current, &claim)
			}
			if err = waitForState(waitCtx, claim.Metadata.Name, "started", options.pollInterval, fetch, logf); err != nil {
				break
			}
		}
	}
	cancel()
	if err != nil {
		return err
	}
	for _, claim := range claims {
		if err := checkServiceList(ctx, run, &claim, true); err != nil {
			return err
		}
	}
	// Readiness was checked independently before asking --watch to confirm it.
	var watched workshopSnapshot
	if err := readJSON(ctx, run, &watched, workshopArgs("status", created.Metadata.Name, created.Metadata.Namespace,
		"--watch", "--interval", "1")...); err != nil {
		return err
	}
	if err := checkWorkshopSnapshot(&watched, &created, claims); err != nil {
		return err
	}
	for _, format := range []string{"table", "yaml"} {
		stdout, err := run(ctx, format, workshopArgs("status", created.Metadata.Name, created.Metadata.Namespace)...)
		if err != nil {
			return err
		}
		if format == "table" {
			if !strings.Contains(string(stdout), "Workshop:    "+created.Metadata.Name+"\n") ||
				!strings.Contains(string(stdout), fmt.Sprintf("Provisioning:  %d/%d ready", seats, seats)) {
				return fmt.Errorf("table workshop status did not contain the expected identity and readiness")
			}
		} else {
			var snapshot workshopSnapshot
			if err := yaml.Unmarshal(stdout, &snapshot); err != nil {
				return fmt.Errorf("workshop status returned invalid YAML: %w", err)
			}
			if err := checkWorkshopSnapshot(&snapshot, &created, claims); err != nil {
				return err
			}
		}
	}
	deleteCtx, cancel := context.WithTimeout(ctx, options.stepTimeout)
	err = destroyWorkshop(deleteCtx, run, &created, claims, options.pollInterval)
	cancel()
	if err != nil {
		return err
	}
	cleaned = true
	if err := checkWorkshopList(ctx, run, &created, false); err != nil {
		return err
	}
	logf("Workshop %s/%s and its seats completed the lifecycle and were deleted", created.Metadata.Namespace, created.Metadata.Name)
	return nil
}

func workshopArgs(action, name, namespace string, extra ...string) []string {
	args := serviceArgs(action, name, namespace, extra...)
	args[0] = "workshop"
	return args
}

func checkWorkshopIdentity(ws, expected *types.Workshop) error {
	if ws.Metadata.Name != expected.Metadata.Name || ws.Metadata.Namespace != expected.Metadata.Namespace || ws.Metadata.UID != expected.Metadata.UID {
		return fmt.Errorf("workshop identity changed; expected %s/%s (UID %s)", expected.Metadata.Namespace, expected.Metadata.Name, expected.Metadata.UID)
	}
	return nil
}

func workshopSeats(snapshot *workshopSnapshot) []types.ResourceClaim {
	var seats []types.ResourceClaim
	for _, claim := range snapshot.Services {
		if claim.Metadata.DeletionTimestamp != "" {
			continue
		}
		if _, tenant := claim.Metadata.Labels[types.BabylonDomain+"/tenant-cluster-pool"]; !tenant {
			seats = append(seats, claim)
		}
	}
	return seats
}

func waitForWorkshopSeats(ctx context.Context, run cliCommand, ws *types.Workshop, count int, interval time.Duration, logf func(string, ...any)) ([]types.ResourceClaim, error) {
	last := "<pending>"
	for {
		var snapshot workshopSnapshot
		if err := readJSON(ctx, run, &snapshot, workshopArgs("status", ws.Metadata.Name, ws.Metadata.Namespace)...); err != nil {
			return nil, fmt.Errorf("waiting for workshop seats (last progress: %s): %w", last, err)
		}
		if err := checkWorkshopIdentity(&snapshot.Workshop, ws); err != nil {
			return nil, err
		}
		if snapshot.Workshop.Metadata.DeletionTimestamp != "" {
			return nil, fmt.Errorf("workshop %s is being deleted while waiting for seats", ws.Metadata.Name)
		}
		seats := workshopSeats(&snapshot)
		ordered := 0
		if status := snapshot.Workshop.Status; status != nil && status.ProvisionCount != nil {
			ordered = status.ProvisionCount.Ordered
			if status.ProvisionCount.Failed > 0 {
				return nil, fmt.Errorf("workshop %s reported %d failed provisions", ws.Metadata.Name, status.ProvisionCount.Failed)
			}
		}
		progress := fmt.Sprintf("%d/%d seats exist; %d ordered", len(seats), count, ordered)
		if progress != last {
			logf("%s: %s", ws.Metadata.Name, progress)
		}
		last = progress
		if ordered == count && len(seats) == count {
			for _, claim := range seats {
				if claim.Metadata.Name == "" || claim.Metadata.UID == "" || claim.Metadata.Namespace != ws.Metadata.Namespace ||
					claim.Metadata.Labels[types.BabylonDomain+"/workshop"] != ws.Metadata.Name {
					return nil, fmt.Errorf("workshop status returned an invalid seat identity or label")
				}
			}
			return seats, nil
		}
		if err := pause(ctx, interval); err != nil {
			return nil, fmt.Errorf("waiting for workshop seats (last progress: %s): %w", last, err)
		}
	}
}

func checkWorkshopSnapshot(snapshot *workshopSnapshot, ws *types.Workshop, expected []types.ResourceClaim) error {
	if err := checkWorkshopIdentity(&snapshot.Workshop, ws); err != nil {
		return err
	}
	seats := workshopSeats(snapshot)
	if snapshot.Workshop.Status == nil || snapshot.Workshop.Status.ProvisionCount == nil ||
		snapshot.Workshop.Status.ProvisionCount.Ordered != len(expected) || len(seats) != len(expected) {
		return fmt.Errorf("workshop status did not include all ordered seats")
	}
	for _, claim := range expected {
		found := false
		for _, current := range seats {
			if current.Metadata.Name == claim.Metadata.Name {
				if err := checkIdentity(&current, &claim); err != nil {
					return err
				}
				if current.Status == nil || current.Status.Summary == nil || current.Status.Summary.State != "started" {
					return fmt.Errorf("workshop seat %s is not started", claim.Metadata.Name)
				}
				found = true
			}
		}
		if !found {
			return fmt.Errorf("workshop status omitted seat %s", claim.Metadata.Name)
		}
	}
	return nil
}

func checkWorkshopList(ctx context.Context, run cliCommand, ws *types.Workshop, present bool) error {
	var workshops []types.Workshop
	if err := readJSON(ctx, run, &workshops, workshopArgs("list", "", ws.Metadata.Namespace)...); err != nil {
		return err
	}
	found := false
	for _, current := range workshops {
		if current.Metadata.Name == ws.Metadata.Name {
			if err := checkWorkshopIdentity(&current, ws); err != nil {
				return err
			}
			found = true
		}
	}
	if found != present {
		return fmt.Errorf("workshop list presence of %s: got %t, want %t", ws.Metadata.Name, found, present)
	}
	return nil
}

func destroyWorkshop(ctx context.Context, run cliCommand, ws *types.Workshop, known []types.ResourceClaim, interval time.Duration) error {
	// Capture additional claims for failure cleanup before the workshop disappears.
	var claims []types.ResourceClaim
	discoveryErr := readJSON(ctx, run, &claims, serviceArgs("list", "", ws.Metadata.Namespace)...)
	byName := make(map[string]types.ResourceClaim)
	for _, claim := range known {
		byName[claim.Metadata.Name] = claim
	}
	for _, claim := range claims {
		if claim.Metadata.Labels[types.BabylonDomain+"/workshop"] == ws.Metadata.Name {
			if existing, ok := byName[claim.Metadata.Name]; ok {
				if err := checkIdentity(&claim, &existing); err != nil {
					discoveryErr = errors.Join(discoveryErr, err)
				}
			} else {
				byName[claim.Metadata.Name] = claim
			}
		}
	}
	_, err := run(ctx, "table", workshopArgs("delete", ws.Metadata.Name, ws.Metadata.Namespace, "--yes")...)
	if err != nil && !claimNotFound(err) {
		return errors.Join(discoveryErr, err)
	}
	for {
		var snapshot workshopSnapshot
		err := readJSON(ctx, run, &snapshot, workshopArgs("status", ws.Metadata.Name, ws.Metadata.Namespace)...)
		if claimNotFound(err) {
			break
		}
		if err != nil {
			return errors.Join(discoveryErr, err)
		}
		if err := checkWorkshopIdentity(&snapshot.Workshop, ws); err != nil {
			return errors.Join(discoveryErr, err)
		}
		if err := pause(ctx, interval); err != nil {
			return errors.Join(discoveryErr, fmt.Errorf("waiting for workshop %s to disappear: %w", ws.Metadata.Name, err))
		}
	}
	for _, claim := range byName {
		fetch := func(ctx context.Context) (*types.ResourceClaim, error) {
			var current types.ResourceClaim
			if err := readJSON(ctx, run, &current, serviceArgs("status", claim.Metadata.Name, claim.Metadata.Namespace)...); err != nil {
				return nil, err
			}
			return &current, checkIdentity(&current, &claim)
		}
		if err := waitForDeletion(ctx, claim.Metadata.Name, interval, fetch); err != nil {
			return errors.Join(discoveryErr, err)
		}
	}
	return discoveryErr
}
