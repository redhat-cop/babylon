#!/bin/bash

# Test scenario: Deletion isolation verification
# Verifies that PRs only flag components they actually delete, not unrelated ones

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="deletion-isolation"

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
    
    # Clean up any test components that might have been created
    echo "Cleaning up any remaining test components..."
    for component in "${ISOLATION_COMPONENTS[@]}"; do
        if [[ -n "$component" ]]; then
            kubectl delete agnosticvcomponent "$component" -n "$OPERATOR_NAMESPACE" --ignore-not-found=true
        fi
    done
    
    exit $exit_code
}

# Arrays to track cleanup items
CLEANUP_BRANCHES=()
CLEANUP_PRS=()
MERGED_PRS=()
ISOLATION_COMPONENTS=()
trap cleanup EXIT

main() {
    echo "=== Test: Deletion Isolation Verification ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    echo "--- Step 1: Creating unrelated components in main branch ---"
    
    # Create multiple unrelated components that should NOT be affected by deletion PRs
    local setup_branch=$(generate_branch_name "${TEST_NAME}-setup")
    CLEANUP_BRANCHES+=("$setup_branch")
    
    echo "Creating setup branch: $setup_branch"
    create_branch "$setup_branch"
    
    # Create isolated test directory for unrelated components
    local unrelated_dir="isolation-unrelated-$(date +%s)"
    create_test_directory "$setup_branch" "$unrelated_dir"
    
    # Create 3 unrelated components that will exist in main branch
    local unrelated_components=()
    for i in 1 2 3; do
        local component_name="unrelated-${i}"
        local component_file="${unrelated_dir}/${component_name}.yaml"
        unrelated_components+=("$component_name")
        ISOLATION_COMPONENTS+=("${unrelated_dir}.${component_name}")
        
        local component_content=$(cat <<EOF
# ${component_name} - Unrelated component for isolation testing
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - isolation-test
      - unrelated
  deployer:
    type: agnosticd

EOF
)
        
        echo "Adding unrelated component $i: $component_file"
        update_file "$setup_branch" "$component_file" "$component_content" "Add unrelated component $i for isolation test"
    done
    
    # Create and merge setup PR to establish unrelated components in main branch
    local setup_pr=$(create_pr "$setup_branch" \
        "Setup unrelated components for isolation test" \
        "This PR sets up unrelated components that should NOT be affected by deletion PRs.")
    CLEANUP_PRS+=("$setup_pr")
    
    echo "Created setup PR #$setup_pr"
    
    # Wait for components to be created
    for component_name in "${unrelated_components[@]}"; do
        local k8s_component_name="${unrelated_dir}.${component_name}"
        if wait_for_component "$k8s_component_name" 120 5; then
            echo "✅ Unrelated component $k8s_component_name created"
        else
            echo "❌ Unrelated component $k8s_component_name was not created"
            return 1
        fi
    done
    
    # Merge setup PR to make components part of main branch
    echo "Merging setup PR to establish unrelated components in main branch"
    merge_pr "$setup_pr" "squash"
    MERGED_PRS+=("$setup_pr")
    
    # Wait for PR metadata cleanup after merge by polling
    echo "Waiting for unrelated components PR metadata cleanup..."
    local setup_max_wait=60
    local setup_interval=5
    local setup_elapsed=0
    
    while [[ $setup_elapsed -lt $setup_max_wait ]]; do
        local all_cleaned=true
        for component_file in "${UNRELATED_COMPONENT_FILES[@]}"; do
            local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
            if component_has_pr_number "$k8s_component_name" "$setup_pr"; then
                all_cleaned=false
                break
            fi
        done
        
        if [[ "$all_cleaned" == "true" ]]; then
            echo "✅ All unrelated components cleaned of PR metadata (${setup_elapsed}s)"
            break
        fi
        
        sleep $setup_interval
        setup_elapsed=$((setup_elapsed + setup_interval))
    done
    
    echo "--- Step 2: Creating target components to be deleted ---"
    
    # Create components that will actually be deleted
    local target_branch=$(generate_branch_name "${TEST_NAME}-targets")
    CLEANUP_BRANCHES+=("$target_branch")
    
    echo "Creating target branch: $target_branch"
    create_branch "$target_branch"
    
    # Create isolated test directory for target components
    local target_dir="isolation-target-$(date +%s)"
    create_test_directory "$target_branch" "$target_dir"
    
    local target_components=()
    for i in 1 2; do
        local component_name="target-${i}"
        local component_file="${target_dir}/${component_name}.yaml"
        target_components+=("$component_name")
        ISOLATION_COMPONENTS+=("${target_dir}.${component_name}")
        
        local component_content=$(cat <<EOF
# ${component_name} - Target component for deletion isolation testing
---
purpose: dev
__meta__:
  asset_uuid: $(uuidgen)
  catalog:
    category: Labs
    keywords:
      - functional-test
      - isolation-test
      - target-for-deletion
  deployer:
    type: agnosticd

EOF
)
        
        echo "Adding target component $i: $component_file"
        update_file "$target_branch" "$component_file" "$component_content" "Add target component $i for isolation test"
    done
    
    # Create and merge target PR to establish target components in main branch
    local target_pr=$(create_pr "$target_branch" \
        "Setup target components for isolation test" \
        "This PR sets up target components that WILL be deleted in the isolation test.")
    CLEANUP_PRS+=("$target_pr")
    
    echo "Created target PR #$target_pr"
    
    # Wait for target components to be created
    for component_name in "${target_components[@]}"; do
        local k8s_component_name="${target_dir}.${component_name}"
        if wait_for_component "$k8s_component_name" 120 5; then
            echo "✅ Target component $k8s_component_name created"
        else
            echo "❌ Target component $k8s_component_name was not created"
            return 1
        fi
    done
    
    # Merge target PR
    echo "Merging target PR to establish target components in main branch"
    merge_pr "$target_pr" "squash"
    MERGED_PRS+=("$target_pr")
    
    # Wait for target components PR metadata cleanup after merge by polling
    echo "Waiting for target components PR metadata cleanup..."
    local target_max_wait=60
    local target_interval=5
    local target_elapsed=0
    
    while [[ $target_elapsed -lt $target_max_wait ]]; do
        local all_target_cleaned=true
        for component_file in "${TARGET_COMPONENT_FILES[@]}"; do
            local k8s_component_name=$(echo "$component_file" | sed 's|\.yaml$||' | tr '/' '.')
            if component_has_pr_number "$k8s_component_name" "$target_pr"; then
                all_target_cleaned=false
                break
            fi
        done
        
        if [[ "$all_target_cleaned" == "true" ]]; then
            echo "✅ All target components cleaned of PR metadata (${target_elapsed}s)"
            break
        fi
        
        sleep $target_interval
        target_elapsed=$((target_elapsed + target_interval))
    done
    
    echo "--- Step 3: Creating deletion PR that only deletes target components ---"
    
    # Create deletion PR that only deletes the target components
    local deletion_branch=$(generate_branch_name "${TEST_NAME}-delete")
    CLEANUP_BRANCHES+=("$deletion_branch")
    
    echo "Creating deletion branch: $deletion_branch"
    create_branch "$deletion_branch"
    
    # Delete ONLY the target component files (not the unrelated ones)
    for component_name in "${target_components[@]}"; do
        local component_file="${target_dir}/${component_name}.yaml"
        echo "Deleting target component file: $component_file"
        delete_file "$deletion_branch" "$component_file" "Delete target component for isolation test"
    done
    
    # Create deletion PR
    local deletion_pr=$(create_pr "$deletion_branch" \
        "Delete only target components (isolation test)" \
        "This PR deletes ONLY target components and should NOT affect unrelated components.

Target components to be deleted:
$(for name in "${target_components[@]}"; do echo "- ${target_dir}.${name}"; done)

Unrelated components that should NOT be affected:
$(for name in "${unrelated_components[@]}"; do echo "- ${unrelated_dir}.${name}"; done)")
    CLEANUP_PRS+=("$deletion_pr")
    
    echo "Created deletion PR #$deletion_pr"
    
    echo "--- Step 4: Verifying GitHub comment mentions only target components ---"
    
    # Check GitHub comment to ensure it only mentions target components
    echo "Waiting for deletion warning comment..."
    if wait_for_pr_comment "$deletion_pr" "Would delete AgnosticVComponent" 60 5; then
        echo "✅ Deletion warning comment posted"
        
        # Get the comment and verify it only mentions target components
        local comment_content=$(gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/issues/${deletion_pr}/comments" | jq -r '.[].body' | grep -A 10 "Would delete")
        
        echo "Comment content preview:"
        echo "$comment_content" | head -10
        
        # Verify target components are mentioned
        local targets_mentioned=0
        local total_targets=${#target_components[@]}
        for component_name in "${target_components[@]}"; do
            local k8s_component_name="${target_dir}.${component_name}"
            if echo "$comment_content" | grep -q "$k8s_component_name"; then
                echo "✅ Target component $k8s_component_name correctly mentioned in comment"
                targets_mentioned=$((targets_mentioned + 1))
            else
                echo "❌ Target component $k8s_component_name NOT mentioned in comment"
            fi
        done
        
        # Verify unrelated components are NOT mentioned
        local unrelated_incorrectly_mentioned=0
        for component_name in "${unrelated_components[@]}"; do
            local k8s_component_name="${unrelated_dir}.${component_name}"
            if echo "$comment_content" | grep -q "$k8s_component_name"; then
                echo "❌ Unrelated component $k8s_component_name incorrectly mentioned in comment"
                unrelated_incorrectly_mentioned=$((unrelated_incorrectly_mentioned + 1))
            else
                echo "✅ Unrelated component $k8s_component_name correctly NOT mentioned in comment"
            fi
        done
        
        if [[ $targets_mentioned -ne $total_targets ]]; then
            echo "❌ Not all target components mentioned in comment ($targets_mentioned/$total_targets)"
            return 1
        fi
        
        if [[ $unrelated_incorrectly_mentioned -gt 0 ]]; then
            echo "❌ COMMENT ISOLATION FAILED: $unrelated_incorrectly_mentioned unrelated components were incorrectly mentioned"
            return 1
        fi
        
    else
        echo "❌ Deletion warning comment was not posted"
        return 1
    fi
    
    echo "--- Step 6: Clean up by closing deletion PR and removing all test components ---"
    
    # Close deletion PR without merge to clean up markers
    echo "Closing deletion PR without merge"
    close_pr "$deletion_pr"
    
    # Brief wait to ensure PR close processing is complete
    echo "Waiting for PR close processing..."
    sleep 5
    
    # Clean up by reverting all merged PRs in reverse order
    echo "Reverting all merged PRs to clean up test components..."
    
    # Revert PRs in reverse order (last merged first)
    for ((i=${#MERGED_PRS[@]}-1; i>=0; i--)); do
        local pr_to_revert="${MERGED_PRS[i]}"
        echo "Creating revert PR for merged PR #$pr_to_revert..."
        
        local revert_pr=$(revert_pr "$pr_to_revert" \
            "Revert isolation test PR #$pr_to_revert" \
            "This reverts PR #$pr_to_revert to clean up components after the deletion isolation test.")
        
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
    echo "Waiting for test components to be deleted from Kubernetes..."
    for component_name in "${unrelated_components[@]}"; do
        local k8s_component_name="${unrelated_dir}.${component_name}"
        if wait_for_component_deleted "$k8s_component_name" 120 5; then
            echo "✅ Test component $k8s_component_name deleted from Kubernetes"
        else
            echo "⚠️ Test component $k8s_component_name still exists (will be cleaned up by trap)"
        fi
    done
    for component_name in "${target_components[@]}"; do
        local k8s_component_name="${target_dir}.${component_name}"
        if wait_for_component_deleted "$k8s_component_name" 120 5; then
            echo "✅ Test component $k8s_component_name deleted from Kubernetes"
        else
            echo "⚠️ Test component $k8s_component_name still exists (will be cleaned up by trap)"
        fi
    done
    
    echo "=== Deletion isolation test completed successfully ==="
    echo "✅ Verified that deletion PRs only affect components they actually delete"
    echo "✅ Verified that unrelated components are not flagged for deletion"
    echo "✅ Verified that GitHub comments only mention actually deleted components"
}

main "$@"
