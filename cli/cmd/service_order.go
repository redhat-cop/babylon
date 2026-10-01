package cmd

import (
	"fmt"
	"io"
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

		params, err := parseParameters(orderParams, catalogItem.Spec.Parameters)
		if err != nil {
			return err
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

func init() {
	serviceCmd.AddCommand(serviceOrderCmd)
	serviceOrderCmd.Flags().StringArrayVar(&orderParams, "param", nil, "parameter in key=value format (repeatable)")
	serviceOrderCmd.Flags().StringVar(&orderEndDate, "end-date", "", "service end date (duration like '72h'/'3d' or date like '2024-12-31')")
	serviceOrderCmd.Flags().StringVar(&orderPurpose, "purpose", "", "purpose for the service (default: Development)")
}
