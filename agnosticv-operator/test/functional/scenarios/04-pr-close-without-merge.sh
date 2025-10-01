#!/bin/bash

# Test scenario: PR closed without merge
# Verifies that components are properly deleted when PR is closed without merging
# This tests the bug fix for the webhook deletion behavior

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="pr-close-without-merge"

# Cleanup function
cleanup() {
    local exit_code=$?
    if [[ -n "${NEW_COMPONENT_BRANCH:-}" ]]; then
        debug "Cleaning up new component branch: $NEW_COMPONENT_BRANCH"
        delete_branch "$NEW_COMPONENT_BRANCH"
    fi
    if [[ -n "${NEW_COMPONENT_PR:-}" ]]; then
        debug "Cleaning up new component PR: $NEW_COMPONENT_PR"
        close_pr "$NEW_COMPONENT_PR"
    fi
    if [[ -n "${MODIFY_COMPONENT_BRANCH:-}" ]]; then
        debug "Cleaning up modify component branch: $MODIFY_COMPONENT_BRANCH"
        delete_branch "$MODIFY_COMPONENT_BRANCH"
    fi
    if [[ -n "${MODIFY_COMPONENT_PR:-}" ]]; then
        debug "Cleaning up modify component PR: $MODIFY_COMPONENT_PR"
        close_pr "$MODIFY_COMPONENT_PR"
    fi
    exit $exit_code
}
trap cleanup EXIT

test_new_component_deletion() {
    echo "--- Testing: New component deletion on PR close ---"
    
    local test_dir="test-new-$(date +%s)"
    local component_name="component"
    local component_file="${test_dir}/${component_name}.yaml"
    
    NEW_COMPONENT_BRANCH=$(generate_branch_name "${TEST_NAME}-new")
    
    echo "Creating branch for new component: $NEW_COMPONENT_BRANCH"
    create_branch "$NEW_COMPONENT_BRANCH"
    
    # Create new component
    local component_content=$(cat <<EOF
# ${component_name} - New component to test deletion
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - deletion-test
  deployer:
    type: agnosticd

EOF
)
    
    # Create isolated test directory for this test
    create_test_directory "$NEW_COMPONENT_BRANCH" "$test_dir"
    
    echo "Adding new component: $component_file"
    update_file "$NEW_COMPONENT_BRANCH" "$component_file" "$component_content" "Add new component for deletion test"
    
    # Create PR
    echo "Creating PR for new component"
    NEW_COMPONENT_PR=$(create_pr "$NEW_COMPONENT_BRANCH" \
        "Add new component $component_name" \
        "This PR adds a new component that should be deleted when closed without merge.")
    
    echo "Created PR #$NEW_COMPONENT_PR for new component"
    
    # Wait for component creation
    echo "Waiting for new component to be created..."
    local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
    if wait_for_component "$k8s_component_name" 120 5; then
        echo "✅ New component created"
    else
        echo "❌ New component was not created"
        return 1
    fi
    
    # Close PR without merge
    echo "Closing PR #$NEW_COMPONENT_PR without merge"
    close_pr "$NEW_COMPONENT_PR"
    
    # Wait for component deletion
    echo "Waiting for new component to be deleted..."
    if wait_for_component_deleted "$k8s_component_name" 120 5; then
        echo "✅ New component deleted after PR closed without merge"
    else
        echo "❌ New component was not deleted after PR closed without merge"
        return 1
    fi
    
    # Check for deletion comment
    echo "Checking for deletion comment..."
    if wait_for_pr_comment "$NEW_COMPONENT_PR" "deleted because PR was closed without merge" 60 5; then
        echo "✅ Deletion comment posted to PR"
    else
        echo "❌ Deletion comment was not posted"
        return 1
    fi
    
    echo "✅ New component deletion test passed"
}

test_modified_component_reversion() {
    echo "--- Testing: Modified component reversion on PR close ---"
    
    # First, create a main branch component by merging a PR
    local base_test_dir="test-base-$(date +%s)"
    local base_component_name="component"
    local base_component_file="${base_test_dir}/${base_component_name}.yaml"
    local base_branch=$(generate_branch_name "${TEST_NAME}-base")
    
    echo "Creating base component on main branch first..."
    create_branch "$base_branch"
    
    local base_content=$(cat <<EOF
# ${base_component_name} - Base component for modification test
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - base
  deployer:
    type: agnosticd

EOF
)
    
    # Create isolated test directory for base component
    create_test_directory "$base_branch" "$base_test_dir"
    
    update_file "$base_branch" "$base_component_file" "$base_content" "Add base component"
    local base_pr=$(create_pr "$base_branch" "Add base component $base_component_name" "Base component for modification test")
    
    # Wait for base component and merge
    local k8s_base_component_name=$(echo "$base_component_file" | sed 's|\.yaml$||' | tr '/' '.')
    wait_for_component "$k8s_base_component_name" 120 5
    merge_pr "$base_pr" "squash"
    
    # Wait for PR metadata cleanup after merge by polling
    echo "Waiting for PR metadata cleanup after merge..."
    local max_wait=60
    local interval=5
    local elapsed=0
    
    while [[ $elapsed -lt $max_wait ]]; do
        if component_has_no_pr_number "$k8s_base_component_name"; then
            echo "✅ PR metadata cleaned up after merge (${elapsed}s)"
            break
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    # Now create a modification PR
    MODIFY_COMPONENT_BRANCH=$(generate_branch_name "${TEST_NAME}-modify")
    
    echo "Creating branch for component modification: $MODIFY_COMPONENT_BRANCH"
    create_branch "$MODIFY_COMPONENT_BRANCH"
    
    # Modify the existing component
    local modified_content=$(cat <<EOF
# ${base_component_name} - Modified component
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - modified
  deployer:
    type: agnosticd

EOF
)
    
    echo "Modifying existing component"
    update_file "$MODIFY_COMPONENT_BRANCH" "$base_component_file" "$modified_content" "Modify existing component for reversion test"
    
    # Create modification PR
    echo "Creating PR for component modification"
    MODIFY_COMPONENT_PR=$(create_pr "$MODIFY_COMPONENT_BRANCH" \
        "Modify component $base_component_name" \
        "This PR modifies an existing component. Changes should be reverted when closed without merge.")
    
    echo "Created PR #$MODIFY_COMPONENT_PR for component modification"
    
    # Wait for component to show PR metadata (webhook processing can take time)
    echo "Waiting for component to show PR metadata..."
    local metadata_max_wait=120
    local metadata_interval=5
    local metadata_elapsed=0
    local has_metadata=false
    
    while [[ $metadata_elapsed -lt $metadata_max_wait ]]; do
        if component_has_pr_number "$k8s_base_component_name" "$MODIFY_COMPONENT_PR"; then
            echo "✅ Component shows PR modification metadata (${metadata_elapsed}s)"
            has_metadata=true
            break
        fi
        sleep $metadata_interval
        metadata_elapsed=$((metadata_elapsed + metadata_interval))
        debug "Still waiting for PR metadata... (${metadata_elapsed}/${metadata_max_wait}s)"
    done
    
    # Verify component has PR metadata (indicating it was modified by PR)
    if [[ "$has_metadata" == "true" ]]; then
        echo "✅ Component shows PR modification metadata"
    else
        echo "❌ Component does not show PR modification metadata"
        return 1
    fi
    
    # Close modification PR without merge
    echo "Closing modification PR #$MODIFY_COMPONENT_PR without merge"
    close_pr "$MODIFY_COMPONENT_PR"
    
    # Wait for PR metadata cleanup (component should remain but lose PR metadata)
    echo "Waiting for component to revert (lose PR metadata)..."
    local max_wait=120
    local interval=10
    local elapsed=0
    
    while [[ $elapsed -lt $max_wait ]]; do
        if component_has_no_pr_number "$k8s_base_component_name"; then
            echo "✅ Component reverted (PR metadata removed) after ${elapsed}s"
            break
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        debug "Still waiting for component reversion... (${elapsed}/${max_wait}s)"
    done
    
    if [[ $elapsed -ge $max_wait ]]; then
        echo "❌ Component was not reverted within ${max_wait}s"
        return 1
    fi
    
    # Verify component still exists (should not be deleted)
    if wait_for_component "$k8s_base_component_name" 30 5; then
        echo "✅ Modified component still exists after reversion (correct behavior)"
    else
        echo "❌ Modified component was deleted (incorrect behavior)"
        return 1
    fi
    
    # Clean up base component by reverting the merged base component PR
    # Note: We only revert the base_pr because it was actually merged.
    # The MODIFY_COMPONENT_PR was closed without merge, so there's nothing to revert.
    echo "Creating revert PR for the merged base component PR #$base_pr..."
    local revert_pr=$(revert_pr "$base_pr" \
        "Revert base component PR #$base_pr" \
        "This reverts the merged PR #$base_pr to clean up the base component after the close-without-merge test.")
    
    if [[ -z "$revert_pr" ]]; then
        echo "❌ Failed to create revert PR for base component"
        exit 1
    fi
    
    echo "Created revert PR #$revert_pr for base component"
    
    echo "Waiting for agnosticv-operator comment on revert PR #$revert_pr..."
    if wait_for_pr_comment "$revert_pr" "Successfully applied revision" 60 5; then
        echo "✅ AgnosticV operator processed revert PR"
    else
        echo "❌ AgnosticV operator did not comment on revert PR"
        exit 1
    fi
    
    echo "Merging revert PR #$revert_pr to remove base component from repository"
    merge_pr "$revert_pr" "squash"
    
    # Wait for base component to be deleted from Kubernetes
    if wait_for_component_deleted "$k8s_base_component_name" 120 5; then
        echo "✅ Base component removed from both repository and Kubernetes"
    else
        echo "⚠️ Base component still exists in Kubernetes, but removed from repository"
    fi
    
    delete_branch "$base_branch"
    
    echo "✅ Modified component reversion test passed"
}

main() {
    echo "=== Test: PR Close Without Merge ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    # Test both scenarios
    test_new_component_deletion
    test_modified_component_reversion
    
    echo "=== All close-without-merge tests completed successfully ==="
}

main "$@"
