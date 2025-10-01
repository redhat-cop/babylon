#!/bin/bash

# GitHub CLI utilities for functional testing

# Check if required environment variables are set
check_env() {
    local required_vars=("GH_TEST_REPO" "GH_TEST_ORG")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "ERROR: Environment variable $var is not set"
            return 1
        fi
    done
}

# Create a unique branch name for testing
generate_branch_name() {
    local prefix="${1:-test}"
    local timestamp=$(date +%s)
    local random=$(openssl rand -hex 4)
    echo "${prefix}-${timestamp}-${random}"
}

# Create a new branch from main
create_branch() {
    local branch_name="$1"
    debug "Creating branch: $branch_name"
    
    # Try to get the default branch SHA (try main first, then master)
    local main_sha=""
    if main_sha=$(gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs/heads/main" --jq '.object.sha' 2>/dev/null); then
        debug "Using main branch as base"
    elif main_sha=$(gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs/heads/master" --jq '.object.sha' 2>/dev/null); then
        debug "Using master branch as base"
    else
        echo "ERROR: Could not find main or master branch" >&2
        return 1
    fi
    
    gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs" \
        --method POST \
        --field "ref=refs/heads/${branch_name}" \
        --field "sha=${main_sha}" > /dev/null
    
    echo "$branch_name"
}

# Delete a branch (cleanup)
delete_branch() {
    local branch_name="$1"
    debug "Deleting branch: $branch_name"
    
    gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs/heads/${branch_name}" \
        --method DELETE 2>/dev/null || true
}

# Create aws/common.yaml for test branches
create_aws_common_yaml() {
    local branch_name="$1"
    
    debug "Creating aws/common.yaml file for test branch"
    local aws_common_content=$(cat <<EOF
---
# AWS account-specific common configuration
# This file provides common settings for all AWS catalog items

cloud_provider: aws

__meta__:
  asset_uuid: $(uuidgen)
  deployer:
    type: agnosticd
    scm_type: git
    scm_url: https://github.com/redhat-cop/agnosticd.git

EOF
)
    update_file "$branch_name" "aws/common.yaml" "$aws_common_content" "Add aws/common.yaml for catalog validation"
}

# Create or update a file in a branch
update_file() {
    local branch_name="$1"
    local file_path="$2"
    local content="$3"
    local commit_message="$4"
    
    debug "Updating file $file_path in branch $branch_name"
    
    # Ensure YAML files end with a newline to satisfy yamllint
    if [[ "$file_path" == *.yaml ]] || [[ "$file_path" == *.yml ]]; then
        if [[ ! "$content" == *$'\n' ]]; then
            content="$content"$'\n'
            debug "Added newline to YAML file $file_path"
        fi
    fi
    
    # Get current file SHA if it exists
    local file_sha=""
    file_sha=$(gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/contents/${file_path}?ref=${branch_name}" \
        --jq '.sha' 2>/dev/null || echo "")
    
    # Encode content to base64
    local encoded_content=$(echo -n "$content" | base64 -w 0)
    
    # Create JSON payload using jq for proper escaping
    local api_data
    if [[ -n "$file_sha" ]]; then
        api_data=$(jq -n \
            --arg message "$commit_message" \
            --arg content "$encoded_content" \
            --arg branch "$branch_name" \
            --arg sha "$file_sha" \
            '{message: $message, content: $content, branch: $branch, sha: $sha}')
    else
        api_data=$(jq -n \
            --arg message "$commit_message" \
            --arg content "$encoded_content" \
            --arg branch "$branch_name" \
            '{message: $message, content: $content, branch: $branch}')
    fi
    
    # Create/update file
    echo "$api_data" | gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/contents/${file_path}" \
        --method PUT \
        --input - > /dev/null
}

# Delete a file from a branch  
delete_file() {
    local branch_name="$1"
    local file_path="$2"
    local commit_message="$3"
    
    debug "Deleting file $file_path from branch $branch_name"
    
    # Get file SHA
    local file_sha=$(gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/contents/${file_path}?ref=${branch_name}" \
        --jq '.sha' 2>/dev/null)
    
    if [[ -n "$file_sha" ]]; then
        gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/contents/${file_path}" \
            --method DELETE \
            --field "message=${commit_message}" \
            --field "sha=${file_sha}" \
            --field "branch=${branch_name}" > /dev/null
    fi
}

# Create a pull request
create_pr() {
    local branch_name="$1"
    local title="$2"
    local body="$3"
    
    debug "Creating PR for branch: $branch_name"
    
    # Determine base branch (main or master)
    local base_branch="main"
    if ! gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs/heads/main" >/dev/null 2>&1; then
        base_branch="master"
    fi
    
    # Create PR and extract number from URL
    local pr_url=$(gh pr create \
        --repo "$GH_TEST_ORG/$GH_TEST_REPO" \
        --head "$branch_name" \
        --base "$base_branch" \
        --title "$title" \
        --body "$body")
    
    # Extract PR number from URL (e.g., https://github.com/owner/repo/pull/123)
    local pr_number=$(echo "$pr_url" | sed 's|.*pull/||')
    
    echo "$pr_number"
}

# Close a pull request without merging
close_pr() {
    local pr_number="$1"
    debug "Closing PR #$pr_number without merge"
    
    if ! gh pr close "$pr_number" --repo "$GH_TEST_ORG/$GH_TEST_REPO" 2>/dev/null; then
        debug "Warning: Failed to close PR #$pr_number (may already be closed or API issue)"
        return 0  # Don't fail the test due to cleanup issues
    fi
}

# Merge a pull request
merge_pr() {
    local pr_number="$1"
    local merge_method="${2:-squash}"  # squash, merge, or rebase
    
    debug "Merging PR #$pr_number using $merge_method"
    
    gh pr merge "$pr_number" \
        --repo "$GH_TEST_ORG/$GH_TEST_REPO" \
        --"$merge_method" \
        --auto
}

# Revert a merged pull request using GitHub's native revert functionality
revert_pr() {
    local pr_number="$1"
    local revert_title="${2:-Revert PR #$pr_number}"
    local revert_body="${3:-This reverts the changes from PR #$pr_number}"
    
    debug "Creating revert PR for #$pr_number"
    
    # Get the PR node ID (required for GraphQL)
    local pr_node_id=$(gh api "repos/$GH_TEST_ORG/$GH_TEST_REPO/pulls/$pr_number" --jq '.node_id')
    
    if [[ -z "$pr_node_id" ]]; then
        echo "ERROR: Could not get node ID for PR #$pr_number" >&2
        return 1
    fi
    
    # Create revert PR using GraphQL API
    local revert_pr_number=$(gh api graphql \
        --field pullRequestId="$pr_node_id" \
        --field title="$revert_title" \
        --field body="$revert_body" \
        -f query='mutation($pullRequestId: ID!, $title: String!, $body: String!) {
            revertPullRequest(input: {pullRequestId: $pullRequestId, title: $title, body: $body}) {
                revertPullRequest {
                    number
                }
            }
        }' --jq '.data.revertPullRequest.revertPullRequest.number')
    
    if [[ -z "$revert_pr_number" ]]; then
        echo "ERROR: Failed to create revert PR for #$pr_number" >&2
        return 1
    fi
    
    echo "$revert_pr_number"
}

# Get PR details
get_pr_details() {
    local pr_number="$1"
    
    gh pr view "$pr_number" \
        --repo "$GH_TEST_ORG/$GH_TEST_REPO" \
        --json number,title,state,headRefName,baseRefName,mergedAt,mergeable
}

# Get PR comments
get_pr_comments() {
    local pr_number="$1"
    
    gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/issues/${pr_number}/comments" \
        --jq '.[].body'
}

# Wait for PR comment containing specific text
wait_for_pr_comment() {
    local pr_number="$1"
    local expected_text="$2"
    local timeout="${3:-60}"  # seconds
    local interval="${4:-5}"   # seconds
    
    debug "Waiting for PR comment containing: $expected_text"
    
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        local comments=$(get_pr_comments "$pr_number")
        if echo "$comments" | grep -q "$expected_text"; then
            debug "Found expected comment after ${elapsed}s"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
        debug "Still waiting... (${elapsed}/${timeout}s)"
    done
    
    echo "ERROR: Expected comment not found within ${timeout}s"
    echo "PR comments:"
    get_pr_comments "$pr_number"
    return 1
}

# Get the latest commit SHA for a branch
get_branch_sha() {
    local branch_name="$1"
    
    gh api "repos/${GH_TEST_ORG}/${GH_TEST_REPO}/git/refs/heads/${branch_name}" \
        --jq '.object.sha'
}

# Check if GitHub CLI is authenticated
check_gh_auth() {
    if ! gh auth status >/dev/null 2>&1; then
        echo "ERROR: GitHub CLI is not authenticated. Run 'gh auth login'"
        return 1
    fi
}

# Create isolated test directory with its own common.yaml
create_test_directory() {
    local branch_name="$1"
    local test_dir="$2"
    
    debug "Creating isolated test directory: $test_dir"
    local test_common_content=$(cat <<EOF
---
# Test-specific common configuration
# This file provides common settings for test catalog items

cloud_provider: aws

__meta__:
  asset_uuid: $(uuidgen)
  deployer:
    type: agnosticd
    scm_type: git
    scm_url: https://github.com/redhat-cop/agnosticd.git

EOF
)
    update_file "$branch_name" "${test_dir}/common.yaml" "$test_common_content" "Add ${test_dir}/common.yaml for test isolation"
}

# Debug logging
debug() {
    if [[ -n "${DEBUG:-}" ]]; then
        echo "[DEBUG] $*" >&2
    fi
}
