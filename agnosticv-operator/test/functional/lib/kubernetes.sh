#!/bin/bash

# Kubernetes utilities for functional testing

# Default namespace for operator components
OPERATOR_NAMESPACE="${OPERATOR_NAMESPACE:-babylon-config}"

# Check if kubectl is available and configured
check_kubectl() {
    if ! command -v kubectl >/dev/null 2>&1; then
        echo "ERROR: kubectl is not installed"
        return 1
    fi
    
    if ! kubectl cluster-info >/dev/null 2>&1; then
        echo "ERROR: kubectl is not configured or cluster is not accessible"
        return 1
    fi
}

# Check if oc is available (preferred for OpenShift)
check_oc() {
    if command -v oc >/dev/null 2>&1; then
        KUBECTL_CMD="oc"
    else
        KUBECTL_CMD="kubectl"
    fi
}

# Initialize kubernetes utilities
init_kubernetes() {
    check_kubectl || return 1
    check_oc
    debug "Using command: $KUBECTL_CMD"
}

# Wait for AgnosticVComponent to exist
wait_for_component() {
    local component_name="$1"
    local timeout="${2:-120}"  # seconds
    local interval="${3:-5}"   # seconds
    
    debug "Waiting for AgnosticVComponent: $component_name"
    
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        if $KUBECTL_CMD get agnosticvcomponent "$component_name" -n "$OPERATOR_NAMESPACE" >/dev/null 2>&1; then
            debug "Component $component_name found after ${elapsed}s"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
        debug "Still waiting for component... (${elapsed}/${timeout}s)"
    done
    
    echo "ERROR: Component $component_name not found within ${timeout}s"
    return 1
}

# Wait for AgnosticVComponent to be deleted
wait_for_component_deleted() {
    local component_name="$1"
    local timeout="${2:-60}"   # seconds
    local interval="${3:-5}"   # seconds
    
    debug "Waiting for AgnosticVComponent to be deleted: $component_name"
    
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        if ! $KUBECTL_CMD get agnosticvcomponent "$component_name" -n "$OPERATOR_NAMESPACE" >/dev/null 2>&1; then
            debug "Component $component_name deleted after ${elapsed}s"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
        debug "Still waiting for deletion... (${elapsed}/${timeout}s)"
    done
    
    echo "ERROR: Component $component_name still exists after ${timeout}s"
    return 1
}

# Check if component has specific PR number
component_has_pr_number() {
    local component_name="$1"
    local expected_pr_number="$2"
    
    # Check both the new annotation format and the old spec field for compatibility
    local actual_pr_number_spec=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.spec.pullRequestNumber}' 2>/dev/null)
    
    local actual_pr_number_annotation=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.metadata.annotations.gpte\.redhat\.com/used-by-prs}' 2>/dev/null)
    
    # Use annotation if available, otherwise fall back to spec field
    local actual_pr_number="${actual_pr_number_annotation:-$actual_pr_number_spec}"
    
    if [[ "$actual_pr_number" == "$expected_pr_number" ]]; then
        return 0
    else
        debug "Component $component_name has PR number: $actual_pr_number, expected: $expected_pr_number"
        return 1
    fi
}

# Check if component has no PR number (main branch component)
component_has_no_pr_number() {
    local component_name="$1"
    
    # Check both the new annotation format and the old spec field for compatibility
    local pr_number_spec=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.spec.pullRequestNumber}' 2>/dev/null)
    
    local pr_number_annotation=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.metadata.annotations.gpte\.redhat\.com/used-by-prs}' 2>/dev/null)
    
    # Use annotation if available, otherwise fall back to spec field
    local pr_number="${pr_number_annotation:-$pr_number_spec}"
    
    if [[ -z "$pr_number" || "$pr_number" == "null" ]]; then
        return 0
    else
        debug "Component $component_name still has PR number: $pr_number"
        return 1
    fi
}

# Get component definition content
get_component_definition() {
    local component_name="$1"
    
    $KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.spec.definition}' 2>/dev/null
}

# Check if component has deletion marker
component_has_deletion_marker() {
    local component_name="$1"
    local expected_pr_number="$2"
    
    local deletion_pr=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.status.wouldBeDeletedByPR}' 2>/dev/null)
    
    if [[ "$deletion_pr" == "$expected_pr_number" ]]; then
        return 0
    else
        debug "Component $component_name deletion marker: $deletion_pr, expected: $expected_pr_number"
        return 1
    fi
}

# Check if component has no deletion marker
component_has_no_deletion_marker() {
    local component_name="$1"
    
    local deletion_pr=$($KUBECTL_CMD get agnosticvcomponent "$component_name" \
        -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.status.wouldBeDeletedByPR}' 2>/dev/null)
    
    if [[ -z "$deletion_pr" || "$deletion_pr" == "null" ]]; then
        return 0
    else
        debug "Component $component_name still has deletion marker: $deletion_pr"
        return 1
    fi
}

# List all AgnosticVComponents
list_components() {
    $KUBECTL_CMD get agnosticvcomponent -n "$OPERATOR_NAMESPACE" \
        -o custom-columns="NAME:.metadata.name,PR:.spec.pullRequestNumber,DELETION:.status.wouldBeDeletedByPR"
}

# Get component by PR number
get_components_by_pr() {
    local pr_number="$1"
    
    $KUBECTL_CMD get agnosticvcomponent -n "$OPERATOR_NAMESPACE" \
        -o json | \
        jq -r ".items[] | select(.spec.pullRequestNumber == $pr_number) | .metadata.name"
}

# Check AgnosticVRepo status
get_repo_status() {
    local repo_name="$1"
    
    $KUBECTL_CMD get agnosticvrepo "$repo_name" -n "$OPERATOR_NAMESPACE" \
        -o jsonpath='{.status}' 2>/dev/null
}

# Wait for repo to be in sync (no errors)
wait_for_repo_sync() {
    local repo_name="$1"
    local timeout="${2:-180}"  # seconds
    local interval="${3:-10}"  # seconds
    
    debug "Waiting for AgnosticVRepo sync: $repo_name"
    
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        local error_msg=$($KUBECTL_CMD get agnosticvrepo "$repo_name" \
            -n "$OPERATOR_NAMESPACE" \
            -o jsonpath='{.status.error.message}' 2>/dev/null)
        
        if [[ -z "$error_msg" || "$error_msg" == "null" ]]; then
            debug "Repo $repo_name synced successfully after ${elapsed}s"
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
        debug "Still waiting for repo sync... (${elapsed}/${timeout}s)"
        debug "Current error: $error_msg"
    done
    
    echo "ERROR: Repo $repo_name not synced within ${timeout}s"
    get_repo_status "$repo_name"
    return 1
}

# Get operator pod logs
get_operator_logs() {
    local lines="${1:-100}"
    
    $KUBECTL_CMD logs -n "$OPERATOR_NAMESPACE" \
        -l app.kubernetes.io/name=babylon-agnosticv-operator \
        --tail="$lines"
}

# Debug logging
debug() {
    if [[ -n "${DEBUG:-}" ]]; then
        echo "[DEBUG] $*" >&2
    fi
}