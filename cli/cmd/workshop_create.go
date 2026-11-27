package cmd

import (
	"fmt"
	"io"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// maxWorkshopConcurrency is the order API's limit for workshop concurrency.
const maxWorkshopConcurrency = 100

var (
	workshopSeats            int
	workshopDisplayName      string
	workshopAccessPassword   string
	workshopOpenRegistration bool
	workshopEndDate          string
	workshopParams           []string
	workshopPurpose          string
	workshopExplanation      string
	workshopWait             time.Duration
)

var workshopCreateCmd = &cobra.Command{
	Use:   "create <catalog-item-name>",
	Short: "Create a new workshop from a catalog item",
	Long: `Create a workshop with the specified number of seats from a catalog item.

The workshop is ordered through a catalog item order. If the catalog item
requires manager approval, the command returns once approval is requested and
the workshop is created after it is approved; follow it with
'babylon order status'. Otherwise the command waits (see --wait) and prints
the created workshop.

Examples:
  babylon workshop create my-catalog-item --seats 10
  babylon workshop create my-catalog-item --seats 5 --end-date 3d --display-name "My Workshop"
  babylon workshop create my-catalog-item --seats 20 --access-password mypass --open-registration`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		catalogItemName := args[0]
		if workshopSeats < 1 {
			return fmt.Errorf("--seats must be at least 1")
		}

		catalogItem, err := apiClient.FindCatalogItem(catalogItemName)
		if err != nil {
			return err
		}

		schedule, endDate, err := orderSchedule(workshopEndDate, catalogItem)
		if err != nil {
			return err
		}
		purpose, explanation, params, err := orderInputs(catalogItem, workshopParams, workshopPurpose, workshopExplanation)
		if err != nil {
			return err
		}

		// Generated here, not by the API, so it can be shown: order responses
		// never include workshop access passwords.
		password := workshopAccessPassword
		if password == "" {
			password, err = api.GeneratePassword(8)
			if err != nil {
				return err
			}
		}
		concurrency := workshopSeats
		if concurrency > maxWorkshopConcurrency {
			concurrency = maxWorkshopConcurrency
		}

		order, err := placeOrder(cmd, &types.OrderSubmission{
			CatalogItem:      types.OrderCatalogItemRef{Name: catalogItem.Metadata.Name, Namespace: catalogItem.Metadata.Namespace},
			Namespace:        namespace,
			OrderType:        types.OrderTypeWorkshop,
			Purpose:          purpose,
			Explanation:      explanation,
			SkipSalesforceID: true,
			Parameters:       params,
			Schedule:         schedule,
			Workshop: &types.OrderWorkshopOptions{
				Count:            workshopSeats,
				Concurrency:      concurrency,
				DisplayName:      workshopDisplayName,
				AccessPassword:   password,
				OpenRegistration: workshopOpenRegistration,
			},
		}, workshopWait)
		if err != nil {
			return err
		}

		return printPlacedOrder(order, "Workshop", func(w io.Writer, resource interface{}) {
			workshop := resource.(*types.Workshop)
			fmt.Fprintf(w, "Workshop created successfully.\n\n")
			fmt.Fprintf(w, "Name:      %s\n", workshop.Metadata.Name)
			fmt.Fprintf(w, "Display:   %s\n", api.WorkshopDisplayName(workshop))
			fmt.Fprintf(w, "Namespace: %s\n", workshop.Metadata.Namespace)
			fmt.Fprintf(w, "Catalog:   %s\n", catalogItemName)
			fmt.Fprintf(w, "Seats:     %d\n", workshopSeats)
			fmt.Fprintf(w, "Password:  %s\n", password)
			switch {
			case workshop.Spec.Lifespan != nil && workshop.Spec.Lifespan.End != "":
				fmt.Fprintf(w, "Expires:   %s\n", workshop.Spec.Lifespan.End)
			case endDate != nil:
				fmt.Fprintf(w, "Expires:   %s\n", endDate.Format(time.RFC3339))
			}
			fmt.Fprintf(w, "\nUse 'babylon workshop list' to check provisioning progress.\n")
		})
	},
}

func init() {
	workshopCmd.AddCommand(workshopCreateCmd)
	workshopCreateCmd.Flags().IntVar(&workshopSeats, "seats", 0, "number of seats to provision (required)")
	workshopCreateCmd.MarkFlagRequired("seats")
	workshopCreateCmd.Flags().StringVar(&workshopDisplayName, "display-name", "", "workshop display name (default: catalog item name)")
	workshopCreateCmd.Flags().StringVar(&workshopAccessPassword, "access-password", "", "access password (default: auto-generated)")
	workshopCreateCmd.Flags().BoolVar(&workshopOpenRegistration, "open-registration", false, "allow open user registration")
	workshopCreateCmd.Flags().StringVar(&workshopEndDate, "end-date", "", "workshop end date (duration like '72h'/'3d' or date like '2024-12-31'; default: catalog lifespan, counted from when the workshop is created)")
	workshopCreateCmd.Flags().StringArrayVar(&workshopParams, "param", nil, "parameter in key=value format (repeatable)")
	workshopCreateCmd.Flags().StringVar(&workshopPurpose, "purpose", "", "purpose for the workshop (default: Development)")
	workshopCreateCmd.Flags().StringVar(&workshopExplanation, "explanation", "", "explanation, required by some purposes")
	workshopCreateCmd.Flags().DurationVar(&workshopWait, "wait", defaultOrderWait, "how long to wait for the workshop to be created or for approval to be requested (0 returns right after submitting)")
}
