#!/bin/bash

# Test scenario: PR merge with component integration
# Verifies that merged PRs keep components and clean up PR metadata

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="pr-merge-component"
TEST_DIR="test-merge-$(date +%s)"
COMPONENT_NAME="component"
COMPONENT_FILE="${TEST_DIR}/${COMPONENT_NAME}.yaml"

# Cleanup function
cleanup() {
    local exit_code=$?
    if [[ -n "${BRANCH_NAME:-}" ]]; then
        debug "Cleaning up branch: $BRANCH_NAME"
        delete_branch "$BRANCH_NAME"
    fi
    if [[ -n "${CLEANUP_BRANCH:-}" ]]; then
        debug "Cleaning up cleanup branch: $CLEANUP_BRANCH"
        delete_branch "$CLEANUP_BRANCH"
    fi
    exit $exit_code
}
trap cleanup EXIT

main() {
    echo "=== Test: PR Merge with Component Integration ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    # Generate unique test data
    BRANCH_NAME=$(generate_branch_name "$TEST_NAME")
    
    echo "Creating test branch: $BRANCH_NAME"
    create_branch "$BRANCH_NAME"
    
    # Create component definition
    local component_content=$(cat <<EOF
---
# ${COMPONENT_NAME} - Test component for merge testing

env_type: ${COMPONENT_NAME}
platform: rhpds
cloud_provider: aws

purpose: "{% raw %}{{ purpose | default('development') }}{% endraw %}"

__meta__:
  catalog:
    category: Labs
    description:
      content: Test component for functional testing of merge operations
      format: asciidoc
    keywords:
      - functional-test
      - merge-test
      - aws
  deployer:
    type: agnosticd
    scm_type: git
    scm_url: https://github.com/redhat-cop/agnosticd.git

EOF
)
    
    # Create isolated test directory for this test
    create_test_directory "$BRANCH_NAME" "$TEST_DIR"
    
    echo "Adding component file: $COMPONENT_FILE"
    update_file "$BRANCH_NAME" "$COMPONENT_FILE" "$component_content" "Add test component for merge test"
    
    # Create pull request
    echo "Creating pull request"
    PR_NUMBER=$(create_pr "$BRANCH_NAME" \
        "Add merge test component $COMPONENT_NAME" \
        "This PR adds a test component that will be merged to verify merge behavior.

This component should:
1. Be created in integration environment
2. Remain after merge
3. Have PR metadata cleaned up after merge")
    
    echo "Created PR #$PR_NUMBER"
    
    # Wait for component creation
    echo "Waiting for component to be created..."
    local k8s_component_name=$(echo "$COMPONENT_FILE" | sed 's|\.yaml$||' | tr '/' '.')
    if wait_for_component "$k8s_component_name" 120 5; then
        echo "✅ Component created for PR #$PR_NUMBER"
    else
        echo "❌ Component was not created within timeout"
        exit 1
    fi
    
    # Verify component has PR metadata
    echo "Verifying component has PR metadata before merge..."
    if component_has_pr_number "$k8s_component_name" "$PR_NUMBER"; then
        echo "✅ Component has PR number before merge"
    else
        echo "❌ Component missing PR metadata before merge"
        exit 1
    fi
    
    # Wait for integration comment
    echo "Waiting for integration comment..."
    if wait_for_pr_comment "$PR_NUMBER" "Successfully applied revision" 60 5; then
        echo "✅ Integration comment posted"
    else
        echo "❌ Integration comment was not posted"
        exit 1
    fi
    
    # Merge the pull request
    echo "Merging pull request #$PR_NUMBER"
    merge_pr "$PR_NUMBER" "squash"
    
    # Verify component still exists after merge
    echo "Verifying component exists after merge..."
    if wait_for_component "$k8s_component_name" 60 5; then
        echo "✅ Component still exists after merge"
    else
        echo "❌ Component was deleted after merge (incorrect behavior)"
        exit 1
    fi
    
    # Verify PR metadata was cleaned up
    echo "Verifying PR metadata cleanup after merge..."
    local max_wait=120
    local interval=10
    local elapsed=0
    
    while [[ $elapsed -lt $max_wait ]]; do
        if component_has_no_pr_number "$k8s_component_name"; then
            echo "✅ PR metadata cleaned up after merge (elapsed: ${elapsed}s)"
            break
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        debug "Still waiting for PR metadata cleanup... (${elapsed}/${max_wait}s)"
    done
    
    if [[ $elapsed -ge $max_wait ]]; then
        echo "❌ PR metadata was not cleaned up within ${max_wait}s"
        echo "Component still has PR number after merge"
        exit 1
    fi
    
    # Verify component definition is still correct
    echo "Verifying component definition after merge..."
    local definition=$(get_component_definition "$k8s_component_name")
    if echo "$definition" | grep -q "merge-test"; then
        echo "✅ Component definition preserved after merge"
    else
        echo "❌ Component definition corrupted after merge"
        exit 1
    fi
    
    # Clean up by reverting the merged PR using GitHub's native revert functionality
    echo "Creating revert PR for the merged PR #$PR_NUMBER..."
    local revert_pr=$(revert_pr "$PR_NUMBER" \
        "Revert merge test component PR #$PR_NUMBER" \
        "This reverts PR #$PR_NUMBER to clean up the test component after the merge test scenario.")
    
    if [[ -z "$revert_pr" ]]; then
        echo "❌ Failed to create revert PR"
        exit 1
    fi
    
    echo "Created revert PR #$revert_pr"
    
    echo "Waiting for agnosticv-operator comment on revert PR #$revert_pr..."
    if wait_for_pr_comment "$revert_pr" "Successfully applied revision" 60 5; then
        echo "✅ AgnosticV operator processed revert PR"
    else
        echo "❌ AgnosticV operator did not comment on revert PR"
        exit 1
    fi
    
    echo "Merging revert PR #$revert_pr to remove component from repository"
    merge_pr "$revert_pr" "squash"
    
    # Wait for component to be deleted from Kubernetes
    if wait_for_component_deleted "$k8s_component_name" 120 5; then
        echo "✅ Test component properly removed from both repository and Kubernetes"
    else
        echo "⚠️ Component still exists in Kubernetes, but removed from repository"
    fi
    
    echo "=== Test completed successfully ==="
}

main "$@"
