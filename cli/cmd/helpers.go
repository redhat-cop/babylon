package cmd

import (
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

func parseEndDate(input string, lifespan interface{}) (time.Time, error) {
	if input == "" {
		return time.Now().UTC().Add(24 * time.Hour), nil
	}

	if d, err := parseDurationString(input); err == nil {
		return time.Now().UTC().Add(d), nil
	}

	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, input); err == nil {
			return t.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("cannot parse %q as duration or date (try '72h', '3d', or '2024-12-31')", input)
}

func parseParameters(params []string, catalogParams []types.CatalogItemParameter) (map[string]interface{}, error) {
	catalogByName := make(map[string]types.CatalogItemParameter, len(catalogParams))
	values := make(map[string]interface{}, len(catalogParams))
	for _, param := range catalogParams {
		catalogByName[param.Name] = param
		if param.OpenAPIV3Schema != nil && param.OpenAPIV3Schema.Default != nil {
			values[param.Name] = param.OpenAPIV3Schema.Default
		} else if param.Value != "" {
			value, err := parseParameterValue(param.Value, param)
			if err != nil {
				return nil, err
			}
			values[param.Name] = value
		}
	}

	for _, input := range params {
		parts := strings.SplitN(input, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid parameter format %q, expected key=value", input)
		}
		param, ok := catalogByName[parts[0]]
		if !ok {
			return nil, fmt.Errorf("unknown parameter %q", parts[0])
		}
		value, err := parseParameterValue(parts[1], param)
		if err != nil {
			return nil, err
		}
		values[param.Name] = value
	}

	for _, param := range catalogParams {
		value, ok := values[param.Name]
		if param.Required && !ok {
			return nil, fmt.Errorf("required parameter %q is missing", param.Name)
		}
		if ok && param.OpenAPIV3Schema != nil && len(param.OpenAPIV3Schema.Enum) > 0 && !enumContains(param.OpenAPIV3Schema.Enum, value) {
			return nil, fmt.Errorf("parameter %q must be one of %v", param.Name, param.OpenAPIV3Schema.Enum)
		}
	}

	return values, nil
}

func parseParameterValue(raw string, param types.CatalogItemParameter) (interface{}, error) {
	schemaType := ""
	if param.OpenAPIV3Schema != nil {
		schemaType = param.OpenAPIV3Schema.Type
	}

	switch schemaType {
	case "boolean":
		if raw != "true" && raw != "false" {
			return nil, fmt.Errorf("parameter %q must be a boolean", param.Name)
		}
		return raw == "true", nil
	case "integer":
		i, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parameter %q must be an integer", param.Name)
		}
		return i, nil
	case "number":
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, fmt.Errorf("parameter %q must be a number", param.Name)
		}
		return f, nil
	}
	return raw, nil
}

func enumContains(enum []interface{}, value interface{}) bool {
	for _, option := range enum {
		if reflect.DeepEqual(option, value) {
			return true
		}
		optionNumber, optionIsNumber := numericValue(option)
		valueNumber, valueIsNumber := numericValue(value)
		if optionIsNumber && valueIsNumber && optionNumber == valueNumber {
			return true
		}
	}
	return false
}

func numericValue(value interface{}) (float64, bool) {
	switch value := value.(type) {
	case int:
		return float64(value), true
	case int8:
		return float64(value), true
	case int16:
		return float64(value), true
	case int32:
		return float64(value), true
	case int64:
		return float64(value), true
	case uint:
		return float64(value), true
	case uint8:
		return float64(value), true
	case uint16:
		return float64(value), true
	case uint32:
		return float64(value), true
	case uint64:
		return float64(value), true
	case float32:
		return float64(value), true
	case float64:
		return value, true
	default:
		return 0, false
	}
}

func parseDurationString(s string) (time.Duration, error) {
	if strings.HasSuffix(s, "d") {
		trimmed := strings.TrimSuffix(s, "d")
		var days float64
		if _, err := fmt.Sscanf(trimmed, "%f", &days); err == nil {
			return time.Duration(days * 24 * float64(time.Hour)), nil
		}
	}
	return time.ParseDuration(s)
}
