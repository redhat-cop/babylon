#!/bin/bash

# Test scenario: Component deletion through PR
# Verifies that PRs that delete components show proper deletion markers

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="component-deletion"

# Cleanup function
cleanup() {
    local exit_code=$?
    for branch in "${CLEANUP_BRANCHES[@]}"; do
        if [[ -n "$branch" ]]; then
            debug "Cleaning up branch: $branch"
            delete_branch "$branch"
        fi
    done
    for pr in "${CLEANUP_PRS[@]}"; do
        if [[ -n "$pr" ]]; then
            debug "Cleaning up PR: $pr"
            close_pr "$pr"
        fi
    done
    exit $exit_code
}

# Arrays to track cleanup items
CLEANUP_BRANCHES=()
CLEANUP_PRS=()
MERGED_PRS=()
trap cleanup EXIT

create_base_components() {
    echo "--- Setting up base components for deletion test ---"
    
    local setup_branch=$(generate_branch_name "${TEST_NAME}-setup")
    CLEANUP_BRANCHES+=("$setup_branch")
    
    echo "Creating setup branch: $setup_branch"
    create_branch "$setup_branch"
    
    # Create isolated test directory for deletion test
    local test_dir="test-deletion-$(date +%s)"
    TEST_DIR="$test_dir"
    create_test_directory "$setup_branch" "$test_dir"
    
    # Create multiple components that we'll later delete
    for i in 1 2; do
        local component_name="component-${i}"
        local component_file="${test_dir}/${component_name}.yaml"
        COMPONENT_NAMES+=("$component_name")
        COMPONENT_FILES+=("$component_file")
        
        local component_content=$(cat <<EOF
# ${component_name} - Component for deletion testing
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
        
        echo "Adding component $i: $component_file"
        update_file "$setup_branch" "$component_file" "$component_content" "Add component $i for deletion test"
    done
    
    # Create and merge setup PR
    local setup_pr=$(create_pr "$setup_branch" \
        "Setup components for deletion test" \
        "This PR sets up components that will be deleted in the deletion test.")
    CLEANUP_PRS+=("$setup_pr")
    
    echo "Created setup PR #$setup_pr"
    
    # Wait for components to be created
    for component_file in "${COMPONENT_FILES[@]}"; do
        local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
        if wait_for_component "$k8s_component_name" 120 5; then
            echo "✅ Component $k8s_component_name created"
        else
            echo "❌ Component $k8s_component_name was not created"
            return 1
        fi
    done
    
    # Merge setup PR to make components part of main branch
    echo "Merging setup PR to establish base components"
    merge_pr "$setup_pr" "squash"
    MERGED_PRS+=("$setup_pr")
    
    # Verify components are now main branch components (no PR metadata)
    for component_file in "${COMPONENT_FILES[@]}"; do
        local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
        local max_wait=120
        local interval=10
        local elapsed=0
        
        while [[ $elapsed -lt $max_wait ]]; do
            if component_has_no_pr_number "$k8s_component_name"; then
                echo "✅ Component $k8s_component_name is now a main branch component"
                break
            fi
            
            sleep $interval
            elapsed=$((elapsed + interval))
        done
        
        if [[ $elapsed -ge $max_wait ]]; then
            echo "❌ Component $k8s_component_name still has PR metadata after merge"
            return 1
        fi
    done
}

test_deletion_markers() {
    echo "--- Testing: Deletion markers for PR that deletes components ---"
    
    local deletion_branch=$(generate_branch_name "${TEST_NAME}-delete")
    CLEANUP_BRANCHES+=("$deletion_branch")
    
    echo "Creating deletion branch: $deletion_branch"
    create_branch "$deletion_branch"
    
    # Delete the component files
    for component_file in "${COMPONENT_FILES[@]}"; do
        echo "Deleting component file: $component_file"
        delete_file "$deletion_branch" "$component_file" "Delete component file for deletion test"
    done
    
    # Create deletion PR
    local deletion_pr=$(create_pr "$deletion_branch" \
        "Delete test components" \
        "This PR deletes components to test deletion marker functionality.

Components to be deleted:
$(for file in "${COMPONENT_FILES[@]}"; do echo "- $(echo "$file" | sed 's|\.yaml$||' | tr '/' '.')"; done)")
    CLEANUP_PRS+=("$deletion_pr")
    
    echo "Created deletion PR #$deletion_pr"
    
    # Check for GitHub comment about deletion (deletion markers were removed from the codebase)
    echo "Waiting for deletion warning comment..."
    if wait_for_pr_comment "$deletion_pr" "Would delete AgnosticVComponent" 60 5; then
        echo "✅ Deletion warning comment posted"
    else
        echo "❌ Deletion warning comment was not posted"
        return 1
    fi
    
    return 0
}

test_deletion_on_merge() {
    echo "--- Testing: Actual deletion when PR is merged ---"
    
    # Use the existing deletion PR from previous test
    local deletion_pr="${CLEANUP_PRS[-1]}"
    
    echo "Merging deletion PR #$deletion_pr"
    merge_pr "$deletion_pr" "squash"
    
    # Wait for components to be actually deleted
    echo "Waiting for components to be deleted after merge..."
    for component_file in "${COMPONENT_FILES[@]}"; do
        local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
        if wait_for_component_deleted "$k8s_component_name" 120 5; then
            echo "✅ Component $k8s_component_name deleted after merge"
        else
            echo "❌ Component $k8s_component_name was not deleted after merge"
            return 1
        fi
    done
    
    echo "✅ All components deleted successfully after merge"
}

test_deletion_comment_on_close() {
    echo "--- Testing: Comment posting when PR closed without merge ---"
    
    # Create new components for this test
    local cleanup_test_branch=$(generate_branch_name "${TEST_NAME}-cleanup-setup")
    CLEANUP_BRANCHES+=("$cleanup_test_branch")
    
    create_branch "$cleanup_test_branch"
    
    # Create isolated test directory for close test
    local close_test_dir="test-close-$(date +%s)"
    create_test_directory "$cleanup_test_branch" "$close_test_dir"
    
    local cleanup_component_name="close-component"
    local cleanup_component_file="${close_test_dir}/${cleanup_component_name}.yaml"
    
    local cleanup_content=$(cat <<EOF
# ${cleanup_component_name} - Component for cleanup testing
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - cleanup-test
  deployer:
    type: agnosticd

EOF
)
    
    update_file "$cleanup_test_branch" "$cleanup_component_file" "$cleanup_content" "Add component for cleanup test"
    
    local cleanup_setup_pr=$(create_pr "$cleanup_test_branch" \
        "Add component for cleanup test" \
        "Component for deletion marker cleanup test")
    CLEANUP_PRS+=("$cleanup_setup_pr")
    
    local k8s_cleanup_component_name=$(echo "$cleanup_component_file" | sed 's|\.yaml$||' | tr '/' '.')
    wait_for_component "$k8s_cleanup_component_name" 120 5
    merge_pr "$cleanup_setup_pr" "squash"
    MERGED_PRS+=("$cleanup_setup_pr")
    
    # Wait for PR metadata cleanup after merge by polling
    echo "Waiting for cleanup component PR metadata to be removed..."
    local cleanup_max_wait=60
    local cleanup_interval=5
    local cleanup_elapsed=0
    
    while [[ $cleanup_elapsed -lt $cleanup_max_wait ]]; do
        if component_has_no_pr_number "$k8s_cleanup_component_name"; then
            echo "✅ Cleanup component PR metadata removed (${cleanup_elapsed}s)"
            break
        fi
        sleep $cleanup_interval
        cleanup_elapsed=$((cleanup_elapsed + cleanup_interval))
    done
    
    # Now create a deletion PR for this component
    local deletion_cleanup_branch=$(generate_branch_name "${TEST_NAME}-cleanup-delete")
    CLEANUP_BRANCHES+=("$deletion_cleanup_branch")
    
    create_branch "$deletion_cleanup_branch"
    delete_file "$deletion_cleanup_branch" "$cleanup_component_file" "Delete component for cleanup test"
    
    local deletion_cleanup_pr=$(create_pr "$deletion_cleanup_branch" \
        "Delete component for cleanup test" \
        "This PR will be closed without merge to test comment posting")
    CLEANUP_PRS+=("$deletion_cleanup_pr")
    
    # Wait for deletion comment to be posted
    echo "Waiting for deletion warning comment..."
    if wait_for_pr_comment "$deletion_cleanup_pr" "Would delete AgnosticVComponent" 60 5; then
        echo "✅ Deletion warning comment posted for cleanup test"
    else
        echo "❌ Deletion warning comment not posted for cleanup test"
        return 1
    fi
    
    # Close PR without merge
    echo "Closing deletion PR without merge"
    close_pr "$deletion_cleanup_pr"
    
    # Verify component still exists
    if wait_for_component "$k8s_cleanup_component_name" 30 5; then
        echo "✅ Component still exists after PR close without merge"
    else
        echo "❌ Component was deleted when it should have been preserved"
        return 1
    fi
    
    # Clean up test component
    kubectl delete agnosticvcomponent "$k8s_cleanup_component_name" -n "$OPERATOR_NAMESPACE" --ignore-not-found=true
}

cleanup_all_merged_components() {
    echo "--- Final cleanup: Revert all merged PRs ---"
    
    # Only cleanup if we have merged PRs to revert
    if [[ ${#MERGED_PRS[@]} -eq 0 ]]; then
        echo "No merged PRs to revert"
        return 0
    fi
    
    # Revert PRs in reverse order (last merged first)
    for ((i=${#MERGED_PRS[@]}-1; i>=0; i--)); do
        local pr_to_revert="${MERGED_PRS[i]}"
        echo "Creating revert PR for merged PR #$pr_to_revert..."
        
        local revert_pr=$(revert_pr "$pr_to_revert" \
            "Revert deletion test PR #$pr_to_revert" \
            "This reverts PR #$pr_to_revert to clean up components after the deletion test.")
        
        if [[ -z "$revert_pr" ]]; then
            echo "❌ Failed to create revert PR for #$pr_to_revert"
            continue
        fi
        
        echo "Created revert PR #$revert_pr for PR #$pr_to_revert"
        
        echo "Waiting for agnosticv-operator comment on revert PR #$revert_pr..."
        if wait_for_pr_comment "$revert_pr" "Successfully applied revision" 60 5; then
            echo "✅ AgnosticV operator processed revert PR #$revert_pr"
        else
            echo "❌ AgnosticV operator did not comment on revert PR #$revert_pr"
            continue
        fi
        
        echo "Merging revert PR #$revert_pr"
        merge_pr "$revert_pr" "squash"
    done
    
    # Wait for components to be deleted from Kubernetes
    echo "Waiting for all test components to be deleted from Kubernetes..."
    for component_file in "${COMPONENT_FILES[@]}"; do
        local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
        if wait_for_component_deleted "$k8s_component_name" 120 5; then
            echo "✅ Test component $k8s_component_name deleted from Kubernetes"
        else
            echo "⚠️ Test component $k8s_component_name still exists (will be cleaned up by trap)"
        fi
    done
}

main() {
    echo "=== Test: Component Deletion Scenarios ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    # Arrays to track components
    COMPONENT_NAMES=()
    COMPONENT_FILES=()
    
    # Run tests in sequence
    create_base_components
    test_deletion_markers
    test_deletion_on_merge
    test_deletion_comment_on_close
    
    # Final cleanup to remove all merged components from repository
    cleanup_all_merged_components
    
    echo "=== All component deletion tests completed successfully ==="
}

main "$@"
