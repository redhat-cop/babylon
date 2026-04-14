package cmd

import (
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var (
	orderParams  []string
	orderEndDate string
	orderPurpose string
)

var serviceOrderCmd = &cobra.Command{
	Use:   "order <catalog-item-name>",
	Short: "Order a new service from the catalog",
	Long: `Order a new service by specifying a catalog item name.

Examples:
  babylon service order my-catalog-item --end-date 2024-12-31
  babylon service order my-catalog-item --param region=us-east-1 --param size=large
  babylon service order my-catalog-item --end-date 72h --purpose Development`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		catalogItemName := args[0]

		// Find the catalog item
		catalogItem, err := apiClient.FindCatalogItem(catalogItemName)
		if err != nil {
			return err
		}

		// Parse end date
		endDate, err := parseEndDate(orderEndDate, catalogItem.Spec.Lifespan)
		if err != nil {
			return fmt.Errorf("invalid --end-date: %w", err)
		}

		// Parse parameters, converting types based on catalog item schema
		params := make(map[string]interface{})
		paramSchemas := make(map[string]string) // name → type
		for _, p := range catalogItem.Spec.Parameters {
			if p.OpenAPIV3Schema != nil && p.OpenAPIV3Schema.Type != "" {
				paramSchemas[p.Name] = p.OpenAPIV3Schema.Type
			}
		}
		for _, p := range orderParams {
			parts := strings.SplitN(p, "=", 2)
			if len(parts) != 2 {
				return fmt.Errorf("invalid parameter format %q, expected key=value", p)
			}
			key, raw := parts[0], parts[1]
			params[key] = convertParamValue(raw, paramSchemas[key])
		}

		if orderPurpose != "" {
			params["purpose"] = orderPurpose
		}

		// Create the service
		serviceNs := namespace
		claim, err := apiClient.OrderService(catalogItem, serviceNs, params, endDate)
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), claim, func(w io.Writer) {
			fmt.Fprintf(w, "Service ordered successfully.\n\n")
			fmt.Fprintf(w, "Name:      %s\n", claim.Metadata.Name)
			fmt.Fprintf(w, "Display:   %s\n", api.DisplayName(claim))
			fmt.Fprintf(w, "Namespace: %s\n", claim.Metadata.Namespace)
			fmt.Fprintf(w, "Catalog:   %s\n", catalogItemName)
			fmt.Fprintf(w, "Expires:   %s\n", endDate.Format(time.RFC3339))
			fmt.Fprintf(w, "\nUse 'babylon service status %s' to check provisioning progress.\n", claim.Metadata.Name)
		})
	},
}

func parseEndDate(input string, lifespan interface{}) (time.Time, error) {
	if input == "" {
		// Default to 1 day if no end date specified
		return time.Now().UTC().Add(24 * time.Hour), nil
	}

	// Try as duration (e.g., "72h", "3d")
	if d, err := parseDurationString(input); err == nil {
		return time.Now().UTC().Add(d), nil
	}

	// Try as absolute date
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

// convertParamValue converts a string value to the appropriate type
// based on the parameter's OpenAPI schema type.
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
	// Handle days
	if strings.HasSuffix(s, "d") {
		trimmed := strings.TrimSuffix(s, "d")
		var days float64
		if _, err := fmt.Sscanf(trimmed, "%f", &days); err == nil {
			return time.Duration(days * 24 * float64(time.Hour)), nil
		}
	}
	return time.ParseDuration(s)
}

func init() {
	serviceCmd.AddCommand(serviceOrderCmd)
	serviceOrderCmd.Flags().StringArrayVar(&orderParams, "param", nil, "parameter in key=value format (repeatable)")
	serviceOrderCmd.Flags().StringVar(&orderEndDate, "end-date", "", "service end date (duration like '72h'/'3d' or date like '2024-12-31')")
	serviceOrderCmd.Flags().StringVar(&orderPurpose, "purpose", "", "purpose for the service (default: Development)")
}
