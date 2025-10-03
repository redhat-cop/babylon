# Functional Tests for AgnosticV Operator

This directory contains functional tests that validate the end-to-end behavior of the AgnosticV operator using real GitHub repositories and the GitHub CLI.

## Overview

These tests use the GitHub CLI (`gh`) to create real pull requests, modify components, and verify the operator's behavior in a live environment. They complement the unit tests by testing the complete PR lifecycle and webhook integration.

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Access to a test GitHub repository configured with AgnosticV operator
- Environment variables configured (see below)

## Test Structure

```
test/functional/
├── lib/              # Shared test utilities and helpers
├── scenarios/        # Individual test scenarios
├── fixtures/         # Test component definitions and templates
└── run-tests.sh      # Main test runner
```

## Environment Variables

```bash
export GH_TEST_REPO="your-org/test-agnosticv-repo"    # Test repository
export GH_TEST_ORG="your-org"                         # GitHub organization
export OPERATOR_NAMESPACE="babylon-config"            # Kubernetes namespace
export WEBHOOK_URL="https://your-webhook-url"         # Webhook endpoint (optional)
```

## Running Tests

### All Tests
```bash
./run-tests.sh
```

### Specific Test Scenario
```bash
./scenarios/01-pr-create-component.sh
```

### With Verbose Output
```bash
DEBUG=1 ./run-tests.sh
```

## Test Scenarios

1. **PR Creation and Component Addition** (`01-pr-create-component.sh`)
   - Creates PR with new component
   - Verifies component appears in Kubernetes
   - Checks GitHub comment

2. **PR Update/Synchronize** (`02-pr-update-component.sh`) 
   - Updates existing PR with modifications
   - Verifies component definition updates
   - Validates GitHub comments

3. **PR Merge Success** (`03-pr-merge-component.sh`)
   - Merges PR after validation
   - Verifies components remain in integration
   - Checks PR metadata cleanup

4. **PR Close Without Merge** (`04-pr-close-without-merge.sh`)
   - Tests both new and modified component scenarios
   - Verifies correct deletion/reversion behavior
   - Validates GitHub comments

5. **Component Deletion** (`05-component-deletion.sh`)
   - Creates PR that deletes components
   - Tests deletion markers
   - Validates merge vs close behavior

6. **Multiple Components** (`06-multiple-components.sh`)
   - PR with mix of operations
   - Tests complex scenarios

7. **Error Handling** (`07-error-handling.sh`)
   - Invalid component definitions
   - Syntax errors and recovery

8. **Webhook Integration** (`08-webhook-integration.sh`)
   - Tests real-time webhook processing
   - Validates immediate vs polling updates

## Test Utilities

The `lib/` directory contains shared utilities:

- `github.sh`: GitHub CLI helper functions
- `kubernetes.sh`: Kubernetes validation functions  
- `assertions.sh`: Test assertion helpers
- `component-templates.sh`: Component generation utilities

## Cleanup

Tests automatically clean up created resources (PRs, branches, etc.) using `defer` statements. Failed tests may leave artifacts that need manual cleanup.

## Contributing

When adding new test scenarios:

1. Follow the naming convention: `NN-description.sh`
2. Use the shared utilities in `lib/`
3. Include cleanup logic with `defer`
4. Add assertions for all expected behaviors
5. Update this README with scenario description