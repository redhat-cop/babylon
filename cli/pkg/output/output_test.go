package output

import (
	"encoding/json"
	"io"
	"os"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
	"gopkg.in/yaml.v3"
)

func TestPrintYAMLSerializesRawMessageAsMapping(t *testing.T) {
	claim := types.ResourceClaim{
		Spec: types.ResourceClaimSpec{
			Resources: []types.ResourceClaimResource{{
				Template: json.RawMessage(`{"kind":"ConfigMap","metadata":{"name":"example"}}`),
			}},
		},
	}

	output := captureStdout(t, func() error { return printYAML(claim) })

	var decoded map[string]interface{}
	if err := yaml.Unmarshal([]byte(output), &decoded); err != nil {
		t.Fatalf("unmarshal YAML output: %v", err)
	}
	resources := decoded["spec"].(map[string]interface{})["resources"].([]interface{})
	template, ok := resources[0].(map[string]interface{})["template"].(map[string]interface{})
	if !ok {
		t.Fatalf("template is not a mapping: %s", output)
	}
	if template["kind"] != "ConfigMap" {
		t.Fatalf("template kind = %v, want ConfigMap", template["kind"])
	}
}

func captureStdout(t *testing.T, fn func() error) string {
	t.Helper()
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatalf("create stdout pipe: %v", err)
	}
	original := os.Stdout
	os.Stdout = write
	t.Cleanup(func() {
		os.Stdout = original
		read.Close()
	})

	if err := fn(); err != nil {
		t.Fatalf("write output: %v", err)
	}
	if err := write.Close(); err != nil {
		t.Fatalf("close stdout pipe: %v", err)
	}
	data, err := io.ReadAll(read)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	return string(data)
}
