package functional

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/redhat-gpte/babylon/cli/pkg/config"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

type cliCommand func(context.Context, string, ...string) ([]byte, error)

type lifecycleOptions struct {
	catalogItem      string
	serviceNamespace string
	stepTimeout      time.Duration
	pollInterval     time.Duration
}

func TestServiceLifecycle(t *testing.T) {
	runner, options := functionalSetup(t)
	if err := runLifecycle(t.Context(), runner.run, options, t.Logf); err != nil {
		t.Fatal(err)
	}
}

func functionalSetup(t *testing.T) (cliRunner, lifecycleOptions) {
	t.Helper()
	if os.Getenv("BABYLON_FUNCTIONAL_TEST") != "1" {
		t.Skip("run make test-functional to test a real Babylon environment")
	}
	configPath := os.Getenv("BABYLON_FUNCTIONAL_CONFIG")
	if configPath == "" {
		configPath = config.DefaultPath()
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("load login config: %v", err)
	}
	if cfg.Auth.Token == "" || len(cfg.Auth.Cookies) == 0 {
		t.Fatal("log in with babylon login first, or set BABYLON_FUNCTIONAL_CONFIG to a logged-in config file")
	}
	server := os.Getenv("BABYLON_FUNCTIONAL_SERVER")
	if server == "" && cfg.Server == "" {
		t.Fatal("login config must specify a server, or set BABYLON_FUNCTIONAL_SERVER")
	}
	item := os.Getenv("BABYLON_FUNCTIONAL_CATALOG_ITEM")
	if item == "" {
		item = "tests.test-empty-config.prod"
	}
	runner := cliRunner{
		binary: buildCLI(t), config: configPath, server: server,
		commandTimeout: durationSetting(t, "BABYLON_FUNCTIONAL_COMMAND_TIMEOUT", 45*time.Second),
	}
	options := lifecycleOptions{
		catalogItem: item, serviceNamespace: os.Getenv("BABYLON_FUNCTIONAL_NAMESPACE"),
		stepTimeout:  durationSetting(t, "BABYLON_FUNCTIONAL_TIMEOUT", 15*time.Minute),
		pollInterval: durationSetting(t, "BABYLON_FUNCTIONAL_POLL_INTERVAL", 5*time.Second),
	}
	t.Logf("Testing catalog item %s using config %s", item, configPath)
	return runner, options
}

func runLifecycle(ctx context.Context, run cliCommand, options lifecycleOptions, logf func(string, ...any)) (err error) {
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

	var created types.ResourceClaim
	args := serviceArgs("order", options.catalogItem, options.serviceNamespace, "--end-date", "2h")
	if err := readJSON(ctx, run, &created, args...); err != nil {
		return err
	}
	if created.Metadata.Name == "" || created.Metadata.Namespace == "" {
		return fmt.Errorf("order response did not include the service name and namespace")
	}
	name, namespace := created.Metadata.Name, created.Metadata.Namespace
	logf("Created service %s/%s", namespace, name)
	fetch := func(ctx context.Context) (*types.ResourceClaim, error) {
		var claim types.ResourceClaim
		if err := readJSON(ctx, run, &claim, serviceArgs("status", name, namespace)...); err != nil {
			return nil, err
		}
		if err := checkIdentity(&claim, &created); err != nil {
			return nil, err
		}
		return &claim, nil
	}
	cleaned := false
	defer func() {
		if cleaned {
			return
		}
		// Cleanup must still run if the lifecycle's context was canceled.
		cleanupCtx, cancel := context.WithTimeout(context.Background(), options.stepTimeout)
		defer cancel()
		logf("Cleaning up service %s/%s", namespace, name)
		if cleanupErr := destroyClaim(cleanupCtx, run, name, namespace, options.pollInterval, fetch); cleanupErr != nil {
			err = errors.Join(err, fmt.Errorf("cleanup of %s/%s failed: %w", namespace, name, cleanupErr))
		}
	}()
	if created.Metadata.UID == "" || created.Spec.Provider == nil || created.Spec.Provider.Name != catalog.Metadata.Name {
		return fmt.Errorf("order response did not include a UID and the expected catalog provider")
	}
	if created.Metadata.Labels[types.BabylonDomain+"/catalogItemName"] != catalog.Metadata.Name ||
		created.Metadata.Labels[types.BabylonDomain+"/catalogItemNamespace"] != catalog.Metadata.Namespace {
		return fmt.Errorf("ordered service has incorrect CatalogItem labels")
	}

	for _, step := range []struct{ action, state string }{
		{"", "started"}, {"stop", "stopped"}, {"start", "started"},
	} {
		if step.action != "" {
			var claim types.ResourceClaim
			if err := readJSON(ctx, run, &claim, serviceArgs(step.action, name, namespace)...); err != nil {
				return err
			}
			if err := checkIdentity(&claim, &created); err != nil {
				return err
			}
		}
		waitCtx, cancel := context.WithTimeout(ctx, options.stepTimeout)
		err := waitForState(waitCtx, name, step.state, options.pollInterval, fetch, logf)
		cancel()
		if err != nil {
			return err
		}
		if err := checkServiceList(ctx, run, &created, true); err != nil {
			return err
		}
		if err := checkStatusFormats(ctx, run, &created, step.state); err != nil {
			return err
		}
	}

	logf("Deleting service %s/%s", namespace, name)
	deleteCtx, cancel := context.WithTimeout(ctx, options.stepTimeout)
	err = destroyClaim(deleteCtx, run, name, namespace, options.pollInterval, fetch)
	cancel()
	if err != nil {
		return err
	}
	cleaned = true
	if err := checkServiceList(ctx, run, &created, false); err != nil {
		return err
	}
	logf("Service %s/%s completed the lifecycle and was deleted", namespace, name)
	return nil
}

func serviceArgs(action, name, namespace string, extra ...string) []string {
	args := []string{"service", action}
	if name != "" {
		args = append(args, name)
	}
	if namespace != "" {
		args = append(args, "--namespace", namespace)
	}
	return append(args, extra...)
}

func readJSON(ctx context.Context, run cliCommand, result any, args ...string) error {
	stdout, err := run(ctx, "json", args...)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(stdout, result); err != nil {
		return fmt.Errorf("%s returned invalid JSON: %w", strings.Join(args, " "), err)
	}
	return nil
}

func checkIdentity(claim, expected *types.ResourceClaim) error {
	if claim.Metadata.Name != expected.Metadata.Name || claim.Metadata.Namespace != expected.Metadata.Namespace || claim.Metadata.UID != expected.Metadata.UID {
		return fmt.Errorf("service identity changed; expected %s/%s (UID %s)", expected.Metadata.Namespace, expected.Metadata.Name, expected.Metadata.UID)
	}
	return nil
}

func checkServiceList(ctx context.Context, run cliCommand, claim *types.ResourceClaim, present bool) error {
	var claims []types.ResourceClaim
	if err := readJSON(ctx, run, &claims, serviceArgs("list", "", claim.Metadata.Namespace)...); err != nil {
		return err
	}
	found := false
	for _, item := range claims {
		if item.Metadata.Name == claim.Metadata.Name {
			if err := checkIdentity(&item, claim); err != nil {
				return err
			}
			found = true
		}
	}
	if found != present {
		return fmt.Errorf("service list presence of %s: got %t, want %t", claim.Metadata.Name, found, present)
	}
	return nil
}

func checkStatusFormats(ctx context.Context, run cliCommand, claim *types.ResourceClaim, state string) error {
	args := serviceArgs("status", claim.Metadata.Name, claim.Metadata.Namespace)
	stdout, err := run(ctx, "table", args...)
	if err != nil {
		return err
	}
	if !strings.Contains(string(stdout), "Name:        "+claim.Metadata.Name+"\n") ||
		!strings.Contains(string(stdout), "State:       "+state+"\n") {
		return fmt.Errorf("table status did not contain the expected service name and state %s", state)
	}
	stdout, err = run(ctx, "yaml", args...)
	if err != nil {
		return err
	}
	var status types.ResourceClaim
	if err := yaml.Unmarshal(stdout, &status); err != nil {
		return fmt.Errorf("status returned invalid YAML: %w", err)
	}
	if err := checkIdentity(&status, claim); err != nil {
		return err
	}
	if status.Status == nil || status.Status.Summary == nil || status.Status.Summary.State != state {
		return fmt.Errorf("YAML status did not report state %s", state)
	}
	return nil
}

func destroyClaim(ctx context.Context, run cliCommand, name, namespace string, interval time.Duration, fetch fetchClaim) error {
	_, err := run(ctx, "table", serviceArgs("delete", name, namespace, "--yes")...)
	if claimNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return waitForDeletion(ctx, name, interval, fetch)
}

func durationSetting(t *testing.T, name string, fallback time.Duration) time.Duration {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		t.Fatalf("%s must be a positive Go duration, got %q", name, value)
	}
	return duration
}

func buildCLI(t *testing.T) string {
	t.Helper()
	if binary := os.Getenv("BABYLON_FUNCTIONAL_BINARY"); binary != "" {
		path, err := filepath.Abs(binary)
		if err != nil {
			t.Fatal(err)
		}
		return path
	}
	name := "babylon"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	binary := filepath.Join(t.TempDir(), name)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "build", "-o", binary, "../..")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build CLI: %v\n%s", err, output)
	}
	return binary
}
