package cmd

import (
	"fmt"
	"strconv"
	"strings"
	"time"
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

func convertParamValue(raw, schemaType string) interface{} {
	switch schemaType {
	case "boolean":
		if b, err := strconv.ParseBool(raw); err == nil {
			return b
		}
	case "integer":
		if i, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return i
		}
	case "number":
		if f, err := strconv.ParseFloat(raw, 64); err == nil {
			return f
		}
	}
	return raw
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
