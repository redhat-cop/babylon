package functional

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

type fetchClaim func(context.Context) (*types.ResourceClaim, error)

type commandError struct {
	stderr string
	cause  error
}

func (e *commandError) Error() string {
	if e.stderr != "" {
		return strings.TrimSpace(e.stderr)
	}
	return fmt.Sprint(e.cause)
}

func (e *commandError) Unwrap() error { return e.cause }

type cliRunner struct {
	binary         string
	config         string
	server         string
	commandTimeout time.Duration
}

func (r cliRunner) run(ctx context.Context, format string, args ...string) ([]byte, error) {
	commandCtx, cancel := context.WithTimeout(ctx, r.commandTimeout)
	defer cancel()
	flags := []string{"--config", r.config, "--output", format}
	if r.server != "" {
		flags = append(flags, "--server", r.server)
	}
	cmd := exec.CommandContext(commandCtx, r.binary, append(flags, args...)...)
	cmd.WaitDelay = 5 * time.Second
	// Use the chosen login config, rather than ambient CLI server/namespace overrides.
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "BABYLON_SERVER=") && !strings.HasPrefix(variable, "BABYLON_NAMESPACE=") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		if commandCtx.Err() != nil {
			err = commandCtx.Err()
		}
		return nil, fmt.Errorf("babylon %s: %w", strings.Join(args, " "), &commandError{stderr: stderr.String(), cause: err})
	}
	return stdout.Bytes(), nil
}

func waitForState(ctx context.Context, name, want string, interval time.Duration, fetch fetchClaim, logf func(string, ...any)) error {
	last := "<pending>"
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("waiting for %s to be %s (last state: %s): %w", name, want, last, err)
		}
		claim, err := fetch(ctx)
		if err != nil {
			return fmt.Errorf("waiting for %s to be %s (last state: %s): %w", name, want, last, err)
		}
		state := "<pending>"
		if claim.Status != nil {
			if summary := claim.Status.Summary; summary != nil {
				state = summary.State
				if failedState(state) {
					return fmt.Errorf("service %s entered %s: %s", name, state, summary.ErrorMessage)
				}
			}
			for _, resource := range claim.Status.Resources {
				if resource.State != nil && resource.State.Spec.Vars != nil {
					resourceState := resource.State.Spec.Vars.CurrentState
					if failedState(resourceState) {
						return fmt.Errorf("service %s resource %s entered %s", name, resource.Name, resourceState)
					}
				}
			}
		}
		if state != last && logf != nil {
			logf("%s: %s (waiting for %s)", name, state, want)
		}
		last = state
		if claim.Metadata.DeletionTimestamp != "" {
			return fmt.Errorf("service %s is being deleted while waiting for %s", name, want)
		}
		if state == want {
			return nil
		}
		if err := pause(ctx, interval); err != nil {
			return fmt.Errorf("waiting for %s to be %s (last state: %s): %w", name, want, last, err)
		}
	}
}

func waitForDeletion(ctx context.Context, name string, interval time.Duration, fetch fetchClaim) error {
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("waiting for %s to disappear: %w", name, err)
		}
		_, err := fetch(ctx)
		if claimNotFound(err) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("waiting for %s to disappear: %w", name, err)
		}
		if err := pause(ctx, interval); err != nil {
			return fmt.Errorf("waiting for %s to disappear: %w", name, err)
		}
	}
}

func failedState(state string) bool {
	return state == "failed" || strings.HasSuffix(state, "-failed")
}

func claimNotFound(err error) bool {
	var failure *commandError
	if !errors.As(err, &failure) {
		return false
	}
	for _, line := range strings.Split(failure.stderr, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "Error: API error 404:") {
			return true
		}
	}
	return false
}

func pause(ctx context.Context, interval time.Duration) error {
	timer := time.NewTimer(interval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
