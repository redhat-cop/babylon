#!/bin/bash

# Test scenario: PR creation with new component
# Verifies that new components are correctly created and GitHub comments are posted

set -euo pipefail

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/github.sh"
source "${SCRIPT_DIR}/../lib/kubernetes.sh"

# Test configuration
TEST_NAME="pr-create-component"
TEST_DIR="test-create-$(date +%s)"
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
    echo "=== Test: PR Creation with New Component ==="
    
    # Check prerequisites
    check_env || exit 1
    check_gh_auth || exit 1
    init_kubernetes || exit 1
    
    # Generate unique test data
    BRANCH_NAME=$(generate_branch_name "$TEST_NAME")
    
    echo "Creating test branch: $BRANCH_NAME"
    create_branch "$BRANCH_NAME"
    
    # Create a new component definition
    local component_content=$(cat <<EOF
---
# ${COMPONENT_NAME} - Test component for functional testing

env_type: ${COMPONENT_NAME}
platform: rhpds
cloud_provider: aws

purpose: "{% raw %}{{ purpose | default('development') }}{% endraw %}"

__meta__:
  catalog:
    category: Labs
    description:
      content: Test component for functional testing of PR creation
      format: asciidoc
    keywords:
      - functional-test
      - automation
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
    update_file "$BRANCH_NAME" "$COMPONENT_FILE" "$component_content" "Add test component $COMPONENT_NAME"
    
    # Create pull request
    echo "Creating pull request"
    PR_NUMBER=$(create_pr "$BRANCH_NAME" \
        "Add test component $COMPONENT_NAME" \
        "This PR adds a new test component for functional testing.

Component details:
- Name: $COMPONENT_NAME
- File: $COMPONENT_FILE
- Type: Test component")
    
    echo "Created PR #$PR_NUMBER"
    
    # Wait for AgnosticVComponent to be created
    # Convert file path to component name (test-create-{timestamp}/component.yaml -> test-create-{timestamp}.component)
    local k8s_component_name=$(echo "$COMPONENT_FILE" | sed 's|\.yaml$||' | tr '/' '.')
    echo "Waiting for component to be created..."
    if wait_for_component "$k8s_component_name" 120 5; then
        echo "✅ Component $k8s_component_name created successfully"
    else
        echo "❌ Component $k8s_component_name was not created within timeout"
        exit 1
    fi
    
    # Check if PR is still open before checking metadata
    local pr_details=$(get_pr_details "$PR_NUMBER")
    local pr_state=$(echo "$pr_details" | jq -r '.state')
    
    if [[ "$pr_state" == "CLOSED" ]]; then
        echo "⚠️  PR was closed, checking if component was properly cleaned up..."
        # Poll for component deletion instead of fixed sleep
        if wait_for_component_deleted "$k8s_component_name" 60 5; then
            echo "✅ Component correctly deleted after PR closed without merge"
        else
            echo "❌ Component still exists after PR closed without merge"
            exit 1
        fi
        
        # Wait for GitHub comment about deletion
        echo "Waiting for GitHub deletion comment..."
        if wait_for_pr_comment "$PR_NUMBER" "deleted because PR was closed without merge" 60 5; then
            echo "✅ Deletion comment posted successfully"
        else
            echo "❌ Deletion comment was not posted within timeout"
            exit 1
        fi
    else
        # Verify component has correct PR metadata
        echo "Verifying component metadata..."
        if component_has_pr_number "$k8s_component_name" "$PR_NUMBER"; then
            echo "✅ Component has correct PR number: $PR_NUMBER"
        else
            echo "❌ Component does not have correct PR number"
            exit 1
        fi
        
        # Wait for GitHub comment
        echo "Waiting for GitHub comment..."
        if wait_for_pr_comment "$PR_NUMBER" "Successfully applied revision" 60 5; then
            echo "✅ GitHub comment posted successfully"
        else
            echo "❌ GitHub comment was not posted within timeout"
            exit 1
        fi
        
        # Verify component definition
        echo "Verifying component definition..."
        local definition=$(get_component_definition "$k8s_component_name")
        if echo "$definition" | grep -q "functional-test"; then
            echo "✅ Component definition contains expected content"
        else
            echo "❌ Component definition missing expected content"
            exit 1
        fi
    fi
    
    echo "=== Test completed successfully ==="
}

main "$@"
