package cmd

import (
	"fmt"
	"io"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var (
	orderParams      []string
	orderEndDate     string
	orderPurpose     string
	orderExplanation string
	orderWait        time.Duration
)

var serviceOrderCmd = &cobra.Command{
	Use:   "order <catalog-item-name>",
	Short: "Order a new service from the catalog",
	Long: `Order a new service by specifying a catalog item name.

The service is ordered through a catalog item order. If the catalog item
requires manager approval, the command returns once approval is requested and
the service is created after it is approved; follow it with
'babylon order status'. Otherwise the command waits (see --wait) and prints
the created service.

Examples:
  babylon service order my-catalog-item --end-date 2024-12-31
  babylon service order my-catalog-item --param region=us-east-1 --param size=large
  babylon service order my-catalog-item --end-date 72h --purpose Development`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		catalogItemName := args[0]

		catalogItem, err := apiClient.FindCatalogItem(catalogItemName)
		if err != nil {
			return err
		}

		schedule, endDate, err := orderSchedule(orderEndDate, catalogItem)
		if err != nil {
			return err
		}
		purpose, explanation, params, err := orderInputs(catalogItem, orderParams, orderPurpose, orderExplanation)
		if err != nil {
			return err
		}

		order, err := placeOrder(cmd, &types.OrderSubmission{
			CatalogItem:      types.OrderCatalogItemRef{Name: catalogItem.Metadata.Name, Namespace: catalogItem.Metadata.Namespace},
			Namespace:        namespace,
			OrderType:        types.OrderTypeService,
			Purpose:          purpose,
			Explanation:      explanation,
			SkipSalesforceID: true,
			Parameters:       params,
			Schedule:         schedule,
		}, orderWait)
		if err != nil {
			return err
		}

		return printPlacedOrder(order, "ResourceClaim", func(w io.Writer, resource interface{}) {
			claim := resource.(*types.ResourceClaim)
			fmt.Fprintf(w, "Service ordered successfully.\n\n")
			fmt.Fprintf(w, "Name:      %s\n", claim.Metadata.Name)
			fmt.Fprintf(w, "Display:   %s\n", api.DisplayName(claim))
			fmt.Fprintf(w, "Namespace: %s\n", claim.Metadata.Namespace)
			fmt.Fprintf(w, "Catalog:   %s\n", catalogItemName)
			switch {
			case claim.Spec.Lifespan != nil && claim.Spec.Lifespan.End != "":
				fmt.Fprintf(w, "Expires:   %s\n", claim.Spec.Lifespan.End)
			case endDate != nil:
				fmt.Fprintf(w, "Expires:   %s\n", endDate.Format(time.RFC3339))
			}
			fmt.Fprintf(w, "\nUse 'babylon service status %s' to check provisioning progress.\n", claim.Metadata.Name)
		})
	},
}

func init() {
	serviceCmd.AddCommand(serviceOrderCmd)
	serviceOrderCmd.Flags().StringArrayVar(&orderParams, "param", nil, "parameter in key=value format (repeatable)")
	serviceOrderCmd.Flags().StringVar(&orderEndDate, "end-date", "", "service end date (duration like '72h'/'3d' or date like '2024-12-31'; default: catalog lifespan, counted from when the service is created)")
	serviceOrderCmd.Flags().StringVar(&orderPurpose, "purpose", "", "purpose for the service (default: Development)")
	serviceOrderCmd.Flags().StringVar(&orderExplanation, "explanation", "", "explanation, required by some purposes")
	serviceOrderCmd.Flags().DurationVar(&orderWait, "wait", defaultOrderWait, "how long to wait for the service to be created or for approval to be requested (0 returns right after submitting)")
}
