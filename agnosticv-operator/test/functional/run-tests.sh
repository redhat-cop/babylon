#!/bin/bash

# Main test runner for AgnosticV operator functional tests
# Runs all test scenarios in sequence with proper environment setup

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"
FAILED_TESTS=()
PASSED_TESTS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] [SCENARIO...]

Run functional tests for AgnosticV operator.

OPTIONS:
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output (DEBUG=1)
    -d, --dry-run       Show which tests would run without executing
    -l, --list          List available test scenarios
    --stop-on-fail      Stop execution on first test failure

SCENARIOS:
    If specified, only run the named scenarios (without .sh extension).
    If not specified, run all scenarios in order.

ENVIRONMENT VARIABLES:
    GH_TEST_REPO        GitHub repository for testing (required)
    GH_TEST_ORG         GitHub organization (required)
    OPERATOR_NAMESPACE  Kubernetes namespace (default: babylon-config)
    WEBHOOK_URL         Webhook endpoint URL (optional)
    DEBUG               Enable verbose output

EXAMPLES:
    $0                                    # Run all tests
    $0 01-pr-create-component             # Run specific test
    $0 -v 01-pr-create-component 02-pr-update-component  # Run specific tests with verbose output
    $0 --list                             # List available tests
    $0 --dry-run                          # Show what would run

EOF
}

# List available scenarios
list_scenarios() {
    echo "Available test scenarios:"
    echo
    for scenario in "$SCENARIOS_DIR"/*.sh; do
        if [[ -f "$scenario" ]]; then
            local name=$(basename "$scenario" .sh)
            local description=""
            
            # Extract description from first comment line
            if description=$(grep -m1 "^# Test scenario:" "$scenario" 2>/dev/null); then
                description=${description#"# Test scenario: "}
            else
                description="No description available"
            fi
            
            printf "  %-30s %s\n" "$name" "$description"
        fi
    done
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    local required_tools=("gh" "kubectl" "oc")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool '$tool' not found in PATH"
            return 1
        fi
    done
    
    # Check required environment variables
    local required_vars=("GH_TEST_REPO" "GH_TEST_ORG")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            return 1
        fi
    done
    
    # Check GitHub authentication
    if ! gh auth status >/dev/null 2>&1; then
        log_error "GitHub CLI is not authenticated. Run 'gh auth login'"
        return 1
    fi
    
    # Check Kubernetes connection
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
    
    # Check operator namespace
    local namespace="${OPERATOR_NAMESPACE:-babylon-config}"
    if ! kubectl get namespace "$namespace" >/dev/null 2>&1; then
        log_error "Operator namespace '$namespace' does not exist"
        return 1
    fi
    
    log_success "All prerequisites met"
}

# Run a single test scenario
run_scenario() {
    local scenario_file="$1"
    local scenario_name=$(basename "$scenario_file" .sh)
    
    log_info "Running scenario: $scenario_name"
    
    local start_time=$(date +%s)
    local temp_log=$(mktemp)
    
    if bash "$scenario_file" 2>&1 | tee "$temp_log"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "Scenario $scenario_name completed in ${duration}s"
        PASSED_TESTS+=("$scenario_name")
        rm -f "$temp_log"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_error "Scenario $scenario_name failed after ${duration}s"
        log_error "Last 20 lines of output:"
        tail -20 "$temp_log" | sed 's/^/  /'
        FAILED_TESTS+=("$scenario_name")
        rm -f "$temp_log"
        return 1
    fi
}

# Main execution
main() {
    local scenarios_to_run=()
    local dry_run=false
    local list_only=false
    local stop_on_fail=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--verbose)
                export DEBUG=1
                ;;
            -d|--dry-run)
                dry_run=true
                ;;
            -l|--list)
                list_only=true
                ;;
            --stop-on-fail)
                stop_on_fail=true
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                scenarios_to_run+=("$1")
                ;;
        esac
        shift
    done
    
    # Handle list option
    if [[ "$list_only" == true ]]; then
        list_scenarios
        exit 0
    fi
    
    # Set default scenarios if none specified
    if [[ ${#scenarios_to_run[@]} -eq 0 ]]; then
        # Run all scenarios in order
        while IFS= read -r -d '' scenario; do
            scenarios_to_run+=($(basename "$scenario" .sh))
        done < <(find "$SCENARIOS_DIR" -name "*.sh" -print0 | sort -z)
    fi
    
    # Validate scenarios exist
    for scenario in "${scenarios_to_run[@]}"; do
        local scenario_file="$SCENARIOS_DIR/${scenario}.sh"
        if [[ ! -f "$scenario_file" ]]; then
            log_error "Scenario '$scenario' not found at $scenario_file"
            exit 1
        fi
    done
    
    # Show what will run
    log_info "Test scenarios to run:"
    for scenario in "${scenarios_to_run[@]}"; do
        echo "  - $scenario"
    done
    
    if [[ "$dry_run" == true ]]; then
        log_info "Dry run mode - not executing tests"
        exit 0
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Run scenarios
    local total_start_time=$(date +%s)
    log_info "Starting functional tests (${#scenarios_to_run[@]} scenarios)"
    
    for scenario in "${scenarios_to_run[@]}"; do
        local scenario_file="$SCENARIOS_DIR/${scenario}.sh"
        
        if ! run_scenario "$scenario_file"; then
            if [[ "$stop_on_fail" == true ]]; then
                log_error "Stopping execution due to test failure (--stop-on-fail)"
                break
            fi
        fi
        
        # Add spacing between tests
        echo
    done
    
    # Print summary
    local total_end_time=$(date +%s)
    local total_duration=$((total_end_time - total_start_time))
    
    echo "========================================"
    echo "           TEST SUMMARY"
    echo "========================================"
    echo "Total execution time: ${total_duration}s"
    echo "Total scenarios: ${#scenarios_to_run[@]}"
    echo "Passed: ${#PASSED_TESTS[@]}"
    echo "Failed: ${#FAILED_TESTS[@]}"
    echo
    
    if [[ ${#PASSED_TESTS[@]} -gt 0 ]]; then
        log_success "Passed tests:"
        for test in "${PASSED_TESTS[@]}"; do
            echo "  ✅ $test"
        done
        echo
    fi
    
    if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
        log_error "Failed tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  ❌ $test"
        done
        echo
        exit 1
    else
        log_success "All tests passed!"
        
        exit 0
    fi
}

main "$@"
