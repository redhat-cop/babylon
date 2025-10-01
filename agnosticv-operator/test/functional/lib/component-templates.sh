#!/bin/bash

# Component template generators for functional testing

# Generate a basic test component
generate_basic_component() {
    local name="$1"
    local description="${2:-Test component for functional testing}"
    local category="${3:-Test}"
    
    cat <<EOF
# ${name} - ${description}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels:
    agnosticv.gpte.redhat.com/test: "true"
data:
  description: "${description}"
  created_at: "$(date -Iseconds)"

__meta__:
  catalog:
    category: ${category}
    keywords:
      - functional-test
      - automation
  deployer:
    type: none
  display_name: "${name}"
  anarchy:
    roles: []
EOF
}

# Generate a component with specific deployer type
generate_component_with_deployer() {
    local name="$1"
    local deployer_type="${2:-none}"
    local description="${3:-Test component with deployer}"
    
    cat <<EOF
# ${name} - ${description}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels:
    agnosticv.gpte.redhat.com/test: "true"
    deployer: "${deployer_type}"
data:
  description: "${description}"
  deployer_type: "${deployer_type}"

__meta__:
  catalog:
    category: Test
    keywords:
      - functional-test
      - deployer-test
  deployer:
    type: ${deployer_type}
  display_name: "${name}"
  anarchy:
    roles: []
EOF
}

# Generate a component with complex metadata
generate_complex_component() {
    local name="$1"
    local version="${2:-1.0.0}"
    local description="${3:-Complex test component}"
    
    cat <<EOF
# ${name} - ${description}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels:
    agnosticv.gpte.redhat.com/test: "true"
    version: "${version}"
    complexity: "high"
data:
  description: "${description}"
  version: "${version}"
  features: |
    - Feature A
    - Feature B
    - Feature C
  configuration: |
    key1: value1
    key2: value2

__meta__:
  catalog:
    category: Test
    subcategory: Complex
    keywords:
      - functional-test
      - complex
      - multi-feature
    runtime: 60
    memory_request: "512Mi"
    cpu_request: "100m"
  deployer:
    type: none
    config:
      timeout: 1800
  display_name: "${name} v${version}"
  description: |
    ${description}
    
    This is a complex component with multiple features and
    detailed configuration options for comprehensive testing.
  anarchy:
    roles:
      - name: test-role
        src: https://github.com/example/test-role.git
        version: main
EOF
}

# Generate an invalid component (for error testing)
generate_invalid_component() {
    local name="$1"
    local error_type="${2:-missing-meta}"
    
    case "$error_type" in
        missing-meta)
            cat <<EOF
# ${name} - Invalid component (missing __meta__)
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  description: "Component without __meta__ section"
EOF
            ;;
        invalid-yaml)
            cat <<EOF
# ${name} - Invalid YAML syntax
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels:
    invalid: yaml: syntax: here
data:
  description: "Invalid YAML"
EOF
            ;;
        invalid-deployer)
            cat <<EOF
# ${name} - Invalid deployer type
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  description: "Component with invalid deployer"

__meta__:
  catalog:
    category: Test
  deployer:
    type: invalid-deployer-type
  display_name: "${name}"
EOF
            ;;
        *)
            echo "Unknown error type: $error_type" >&2
            return 1
            ;;
    esac
}

# Generate a component that references other files
generate_component_with_includes() {
    local name="$1"
    local base_dir="${2:-aws}"
    
    cat <<EOF
# ${name} - Component with includes
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels:
    agnosticv.gpte.redhat.com/test: "true"
data:
  description: "Component that includes other files"
  
# Include common configuration
{{ include "${base_dir}/common/base-config.yaml" }}

__meta__:
  catalog:
    category: Test
    keywords:
      - functional-test
      - includes
  deployer:
    type: none
  display_name: "${name}"
  anarchy:
    roles: []
EOF
}

# Generate multiple related components
generate_component_suite() {
    local base_name="$1"
    local count="${2:-3}"
    local base_dir="${3:-aws}"
    
    for i in $(seq 1 "$count"); do
        local component_name="${base_name}-${i}"
        local component_file="${base_dir}/${component_name}.yaml"
        
        echo "# Component $i of $count"
        echo "FILE: $component_file"
        generate_basic_component "$component_name" "Component $i in suite of $count" "TestSuite"
        echo ""
    done
}

# Generate component changelog/history
generate_component_versions() {
    local base_name="$1"
    local versions=("${@:2}")
    
    for version in "${versions[@]}"; do
        echo "# Version $version"
        generate_complex_component "$base_name" "$version" "Test component version $version"
        echo ""
        echo "---"
        echo ""
    done
}