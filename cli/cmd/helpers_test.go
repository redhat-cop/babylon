package cmd

import (
	"reflect"
	"strings"
	"testing"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func TestParseParameters(t *testing.T) {
	parameters := []types.CatalogItemParameter{
		{Name: "name", Required: true, OpenAPIV3Schema: &types.SchemaSpec{Type: "string"}},
		{Name: "enabled", OpenAPIV3Schema: &types.SchemaSpec{Type: "boolean"}},
		{Name: "count", OpenAPIV3Schema: &types.SchemaSpec{Type: "integer"}},
		{Name: "ratio", OpenAPIV3Schema: &types.SchemaSpec{Type: "number"}},
		{Name: "region", Required: true, OpenAPIV3Schema: &types.SchemaSpec{Type: "string", Default: "us-east-1", Enum: []interface{}{"us-east-1", "us-west-2"}}},
		{Name: "legacy", OpenAPIV3Schema: &types.SchemaSpec{Type: "string"}, Value: "legacy-default"},
	}

	tests := []struct {
		name    string
		params  []string
		want    map[string]interface{}
		wantErr string
	}{
		{
			name:   "parses typed values and defaults",
			params: []string{"name=demo", "enabled=true", "count=42", "ratio=3.5"},
			want: map[string]interface{}{
				"name": "demo", "enabled": true, "count": int64(42), "ratio": 3.5,
				"region": "us-east-1", "legacy": "legacy-default",
			},
		},
		{name: "rejects missing required parameter", params: []string{"enabled=true"}, wantErr: `required parameter "name" is missing`},
		{name: "rejects unknown parameter", params: []string{"name=demo", "unknown=value"}, wantErr: `unknown parameter "unknown"`},
		{name: "rejects invalid integer", params: []string{"name=demo", "count=one"}, wantErr: `parameter "count" must be an integer`},
		{name: "rejects invalid boolean", params: []string{"name=demo", "enabled=maybe"}, wantErr: `parameter "enabled" must be a boolean`},
		{name: "rejects invalid number", params: []string{"name=demo", "ratio=NaN"}, wantErr: `parameter "ratio" must be a number`},
		{name: "rejects enum mismatch", params: []string{"name=demo", "region=eu-central-1"}, wantErr: `parameter "region" must be one of`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseParameters(tt.params, parameters)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("parseParameters() error = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseParameters() error = %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("parseParameters() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
