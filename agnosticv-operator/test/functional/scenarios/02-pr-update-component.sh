#!/bin/bash

# Test scenario: PR update/synchronize with component modification
# Verifies that component updates are correctly processed and tracked

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="pr-update-component"
TEST_DIR="test-update-$(date +%s)"
COMPONENT_NAME="component"
COMPONENT_FILE="${TEST_DIR}/${COMPONENT_NAME}.yaml"

# Cleanup function
cleanup() {
    local exit_code=$?
    if [[ -n "${BRANCH_NAME:-}" ]]; then
        debug "Cleaning up branch: $BRANCH_NAME"
        delete_branch "$BRANCH_NAME"
    fi
    if [[ -n "${PR_NUMBER:-}" ]]; then
        debug "Cleaning up PR: $PR_NUMBER"
        close_pr "$PR_NUMBER"
    fi
    exit $exit_code
}
trap cleanup EXIT

main() {
    echo "=== Test: PR Update with Component Modification ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    # Generate unique test data
    BRANCH_NAME=$(generate_branch_name "$TEST_NAME")
    
    echo "Creating test branch: $BRANCH_NAME"
    create_branch "$BRANCH_NAME"
    
    # Create initial component
    local initial_content=$(cat <<EOF
---
# ${COMPONENT_NAME} - Test component for update testing

env_type: ${COMPONENT_NAME}
platform: rhpds
cloud_provider: aws

purpose: "{% raw %}{{ purpose | default('development') }}{% endraw %}"

__meta__:
  catalog:
    category: Labs
    description:
      content: Test component for functional testing of PR updates
      format: asciidoc
    keywords:
      - functional-test
      - update-test
      - aws
  deployer:
    type: agnosticd
    scm_type: git
    scm_url: https://github.com/redhat-cop/agnosticd.git

EOF
)
    
    # Create isolated test directory for this test
    create_test_directory "$BRANCH_NAME" "$TEST_DIR"
    
    echo "Adding initial component file: $COMPONENT_FILE"
    update_file "$BRANCH_NAME" "$COMPONENT_FILE" "$initial_content" "Add initial test component $COMPONENT_NAME"
    
    # Create pull request
    echo "Creating pull request"
    PR_NUMBER=$(create_pr "$BRANCH_NAME" \
        "Add test component $COMPONENT_NAME" \
        "This PR adds and then updates a test component for functional testing.")
    
    echo "Created PR #$PR_NUMBER"
    
    # Wait for initial component creation
    echo "Waiting for initial component to be created..."
    local k8s_component_name=$(echo "$COMPONENT_FILE" | sed 's|\.yaml$||' | tr '/' '.')
    if wait_for_component "$k8s_component_name" 120 5; then
        echo "✅ Initial component created successfully"
    else
        echo "❌ Initial component was not created within timeout"
        exit 1
    fi
    
    # Wait for initial GitHub comment
    echo "Waiting for initial GitHub comment..."
    if wait_for_pr_comment "$PR_NUMBER" "Created AgnosticVComponent" 60 5; then
        echo "✅ Initial GitHub comment posted"
    else
        echo "❌ Initial GitHub comment was not posted"
        exit 1
    fi
    
    # Update the component with new content
    local updated_content=$(cat <<EOF
---
# ${COMPONENT_NAME} - Updated test component

env_type: ${COMPONENT_NAME}
platform: rhpds
cloud_provider: aws

purpose: "{% raw %}{{ purpose | default('production') }}{% endraw %}"

__meta__:
  catalog:
    category: Labs
    description:
      content: Updated test component for functional testing of PR updates
      format: asciidoc
    keywords:
      - functional-test
      - update-test
      - updated
      - aws
  deployer:
    type: agnosticd
    scm_type: git
    scm_url: https://github.com/redhat-cop/agnosticd.git

EOF
)
    
    echo "Updating component with new content..."
    update_file "$BRANCH_NAME" "$COMPONENT_FILE" "$updated_content" "Update test component $COMPONENT_NAME to v2"
    
    # Wait for component update to be processed with retry loop
    echo "Waiting for component update to be processed..."
    local max_wait=120
    local interval=10
    local elapsed=0
    local updated=false
    
    while [[ $elapsed -lt $max_wait ]]; do
        local definition=$(get_component_definition "$k8s_component_name")
        if echo "$definition" | grep -q "updated"; then
            echo "✅ Component definition updated with new content (elapsed: ${elapsed}s)"
            updated=true
            break
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        echo "Still waiting for component update... (${elapsed}/${max_wait}s)"
    done
    
    if [[ "$updated" != "true" ]]; then
        echo "❌ Component definition not updated correctly within timeout"
        local definition=$(get_component_definition "$k8s_component_name")
        echo "Current definition: $definition"
        exit 1
    fi
    
    # Wait for update GitHub comment
    echo "Waiting for update GitHub comment..."
    if wait_for_pr_comment "$PR_NUMBER" "Updated AgnosticVComponent" 60 5; then
        echo "✅ Update GitHub comment posted"
    else
        echo "❌ Update GitHub comment was not posted"
        exit 1
    fi
    
    # Verify component still has correct PR metadata
    echo "Verifying component PR metadata after update..."
    if component_has_pr_number "$k8s_component_name" "$PR_NUMBER"; then
        echo "✅ Component still has correct PR number after update"
    else
        echo "❌ Component lost PR metadata after update"
        exit 1
    fi
    
    echo "=== Test completed successfully ==="
}

main "$@"
