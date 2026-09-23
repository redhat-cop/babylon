# Babylon CLI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the approved CLI defects from GPTEINFRA-17994, GPTEINFRA-17995, GPTEINFRA-17997, and GPTEINFRA-17998 without changing the separate server-side authorization work in GPTEINFRA-17996.

**Architecture:** Keep request authorization authoritative in the Catalog API, which is explicitly out of scope here. Add unit tests around the Go CLI's HTTP transport, payload construction, serialization, persistence, and input validation. Use the existing UI implementations as the compatibility reference for lifecycle and Workshop payloads.

**Tech Stack:** Go 1.25, Cobra, `net/http/httptest`, `gopkg.in/yaml.v3`, GitHub Actions.

**Spec:** Jira tickets GPTEINFRA-17994, GPTEINFRA-17995, GPTEINFRA-17997, and GPTEINFRA-17998.

## Global Constraints

- Make no Catalog API authorization changes; GPTEINFRA-17996 is separate work.
- Keep all changes in the current Jujutsu working-copy change and do not commit or push.
- Preserve the approved behavior that every published Babylon release ships a CLI binary with the full release tag as its version.
- Tests must use local `httptest` servers and dummy credentials only.

---

### Task 1: Secure HTTP Transport and Debug Logging

**Files:**
- Modify: `cli/pkg/api/client.go`
- Create: `cli/pkg/api/client_test.go`

**Interfaces:**
- Produces a redirect policy that carries credentials only to same-origin destinations and prevents HTTPS-to-HTTP redirects.
- Produces debug output that never contains bearer tokens, OAuth cookie values, or `/auth/session` response bodies.

- [ ] **Step 1: Write failing transport tests**

Use two `httptest` servers. Assert a same-origin redirect preserves an authenticated request, while a cross-origin redirect receives neither `Authentication` nor the proxy cookie. Add a debug test that supplies a token, a `Set-Cookie` header, and an `/auth/session` JSON body and asserts no secret appears in stderr.

- [ ] **Step 2: Run the tests to verify failure**

Run: `go test ./pkg/api -run 'Test.*Redirect|Test.*Debug' -v`

Expected: the cross-origin server receives credentials and debug output contains dummy secrets.

- [ ] **Step 3: Implement the minimal transport changes**

Compare redirect source and destination origins including scheme, host, and port. Preserve method/body only where appropriate, carry credentials only for same-origin redirects, reject downgrade redirects, redact `Set-Cookie`, and suppress body previews for authentication endpoints.

- [ ] **Step 4: Run the focused tests**

Run: `go test ./pkg/api -run 'Test.*Redirect|Test.*Debug' -v`

Expected: PASS.

### Task 2: Match Lifecycle and Workshop Creation Payloads

**Files:**
- Modify: `cli/pkg/api/service.go`
- Modify: `cli/pkg/api/workshop.go`
- Modify: `cli/pkg/types/catalog.go`
- Create: `cli/pkg/api/service_test.go`
- Create: `cli/pkg/api/workshop_test.go`

**Interfaces:**
- `StartResourceClaim` and `StopResourceClaim` choose provider parameter values for provider-backed claims and resource action schedules for legacy claims without a summary.
- `CreateWorkshop` copies lifespan guardrails and lab UI redirect configuration from the CatalogItem.

- [ ] **Step 1: Write failing payload tests**

Use an `httptest` Kubernetes proxy to capture PATCH and POST bodies. Cover a legacy ResourceClaim with template action schedules, a provider-backed ResourceClaim, and a Workshop CatalogItem containing `maximum`, `relativeMaximum`, and `workshopLabUiRedirect`.

- [ ] **Step 2: Run the tests to verify failure**

Run: `go test ./pkg/api -run 'Test(Start|Stop).*Legacy|TestCreateWorkshop' -v`

Expected: legacy schedules and Workshop guardrail fields are absent from generated payloads.

- [ ] **Step 3: Implement the minimal payload changes**

Decode legacy resource templates, mutate action schedules only for resources that support the requested action, and marshal the updated full spec. Add CatalogItem fields needed to preserve Workshop lifespan constraints and lab UI redirect settings.

- [ ] **Step 4: Run the focused tests**

Run: `go test ./pkg/api -run 'Test(Start|Stop).*Legacy|TestCreateWorkshop' -v`

Expected: PASS.

### Task 3: Validate Ordering Input Before Submission

**Files:**
- Modify: `cli/cmd/helpers.go`
- Modify: `cli/cmd/service_order.go`
- Modify: `cli/cmd/workshop_create.go`
- Create: `cli/cmd/helpers_test.go`

**Interfaces:**
- Produces `parseParameters(params []string, catalogParams []types.CatalogItemParameter) (map[string]interface{}, error)`.
- Rejects unknown parameters, missing required parameters, malformed booleans/integers/numbers, and values outside an OpenAPI enum before making HTTP calls.

- [ ] **Step 1: Write failing parameter tests**

Table-test valid typed values plus each rejected case. Include a required parameter without a default, unknown key, invalid integer, invalid boolean, and enum mismatch.

- [ ] **Step 2: Run the tests to verify failure**

Run: `go test ./cmd -run TestParseParameters -v`

Expected: invalid values are converted to strings or accepted without an error.

- [ ] **Step 3: Implement the shared parser and wire both commands to it**

Replace silent conversion fallback with explicit validation. Apply defaults before checking required fields, retain exact JSON scalar types, and use the shared parser from both order commands.

- [ ] **Step 4: Run the focused tests**

Run: `go test ./cmd -run TestParseParameters -v`

Expected: PASS.

### Task 4: Correct YAML Output and Login Persistence

**Files:**
- Modify: `cli/pkg/output/output.go`
- Modify: `cli/cmd/login.go`
- Create: `cli/pkg/output/output_test.go`
- Create: `cli/cmd/login_test.go`

**Interfaces:**
- YAML output represents `json.RawMessage` as its JSON object or array, not bytes.
- A failed `config.Save` makes `browserLogin` return an error without printing a false successful-save message.

- [ ] **Step 1: Write failing output and login tests**

Marshal a ResourceClaim containing a raw JSON template and assert the YAML contains a mapping. For login, inject a test config path whose parent cannot be created, submit a local callback with dummy credentials, and assert an error with no successful-save message.

- [ ] **Step 2: Run the tests to verify failure**

Run: `go test ./pkg/output ./cmd -run 'Test.*YAML|TestBrowserLogin.*Save' -v`

Expected: YAML contains byte values and login returns nil after save failure.

- [ ] **Step 3: Implement the minimal fixes**

Normalize raw JSON before YAML marshaling without changing JSON output. Return a wrapped save error from login and print its success output only after `config.Save` completes.

- [ ] **Step 4: Run the focused tests**

Run: `go test ./pkg/output ./cmd -run 'Test.*YAML|TestBrowserLogin.*Save' -v`

Expected: PASS.

### Task 5: Harden Release Workflow and Align Documentation

**Files:**
- Modify: `.github/workflows/cli-release.yaml`
- Modify: `docs/design/cli-design.adoc`
- Modify: `docs/design/cli-implementation-plan.adoc`

**Interfaces:**
- The build step receives `VERSION` through an environment variable and does not embed a release tag directly in shell source.
- Documentation describes browser login only and the implemented workshop command set.

- [ ] **Step 1: Add a failing workflow safety probe**

Add a focused shell-based test command that substitutes a tag containing command substitution into the intended build-version path and demonstrates the current direct interpolation evaluates it.

- [ ] **Step 2: Run the probe to verify failure**

Run the focused workflow safety probe and record that the sentinel command is evaluated.

- [ ] **Step 3: Implement the workflow and documentation changes**

Expose `VERSION` as a build-step environment variable and reference it as `"$VERSION"` in the linker flags. Remove unsupported token-auth documentation and update workshop statements to reflect the implementation.

- [ ] **Step 4: Run workflow and documentation validation**

Run: `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/cli-release.yaml`

Expected: PASS. Repeat the safety probe and confirm its sentinel is not evaluated.

### Task 6: Full Regression Verification

**Files:**
- Verify: all modified files

- [ ] **Step 1: Format and run all CLI tests**

Run: `gofmt -w $(git diff --name-only -- '*.go') && go test ./... && go vet ./... && go mod verify`

- [ ] **Step 2: Cross-compile release targets**

Run the five `CGO_ENABLED=0` combinations in the release workflow and invoke the Linux binary’s `version` command.

- [ ] **Step 3: Check workflow and repository cleanliness**

Run: `actionlint`, `git diff --check`, `git diff`, and `jj status`.

- [ ] **Step 4: Request final review**

Review the uncommitted diff for the four Jira requirements and verify the Catalog API was not modified.
