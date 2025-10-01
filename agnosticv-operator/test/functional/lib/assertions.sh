#!/bin/bash

# Test assertion helpers for functional testing

# Assert that a condition is true
assert_true() {
    local condition="$1"
    local message="${2:-Assertion failed}"
    
    if [[ "$condition" != "0" ]]; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Assert that a condition is false
assert_false() {
    local condition="$1"
    local message="${2:-Assertion failed}"
    
    if [[ "$condition" == "0" ]]; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Assert that two values are equal
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Values not equal}"
    
    if [[ "$expected" != "$actual" ]]; then
        echo "ASSERTION FAILED: $message"
        echo "  Expected: '$expected'"
        echo "  Actual:   '$actual'"
        return 1
    fi
    return 0
}

# Assert that a string contains a substring
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-String does not contain expected substring}"
    
    if [[ "$haystack" != *"$needle"* ]]; then
        echo "ASSERTION FAILED: $message"
        echo "  String:    '$haystack'"
        echo "  Expected:  '$needle'"
        return 1
    fi
    return 0
}

# Assert that a string does not contain a substring
assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-String contains unexpected substring}"
    
    if [[ "$haystack" == *"$needle"* ]]; then
        echo "ASSERTION FAILED: $message"
        echo "  String:      '$haystack'"
        echo "  Unexpected:  '$needle'"
        return 1
    fi
    return 0
}

# Assert that a string matches a pattern
assert_matches() {
    local string="$1"
    local pattern="$2"
    local message="${3:-String does not match pattern}"
    
    if [[ ! "$string" =~ $pattern ]]; then
        echo "ASSERTION FAILED: $message"
        echo "  String:   '$string'"
        echo "  Pattern:  '$pattern'"
        return 1
    fi
    return 0
}

# Assert that a file exists
assert_file_exists() {
    local file="$1"
    local message="${2:-File does not exist: $file}"
    
    if [[ ! -f "$file" ]]; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Assert that a directory exists
assert_dir_exists() {
    local dir="$1"
    local message="${2:-Directory does not exist: $dir}"
    
    if [[ ! -d "$dir" ]]; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Assert that a command succeeds
assert_success() {
    local command="$1"
    local message="${2:-Command failed: $command}"
    
    if ! eval "$command" >/dev/null 2>&1; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Assert that a command fails
assert_failure() {
    local command="$1"
    local message="${2:-Command unexpectedly succeeded: $command}"
    
    if eval "$command" >/dev/null 2>&1; then
        echo "ASSERTION FAILED: $message"
        return 1
    fi
    return 0
}

# Debug logging
debug() {
    if [[ -n "${DEBUG:-}" ]]; then
        echo "[DEBUG] $*" >&2
    fi
}