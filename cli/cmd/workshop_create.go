package cmd

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var (
	workshopSeats            int
	workshopDisplayName      string
	workshopAccessPassword   string
	workshopOpenRegistration bool
	workshopEndDate          string
	workshopParams           []string
)

var workshopCreateCmd = &cobra.Command{
	Use:   "create <catalog-item-name>",
	Short: "Create a new workshop from a catalog item",
	Long: `Create a workshop with the specified number of seats from a catalog item.

Examples:
  babylon workshop create my-catalog-item --seats 10
  babylon workshop create my-catalog-item --seats 5 --end-date 3d --display-name "My Workshop"
  babylon workshop create my-catalog-item --seats 20 --access-password mypass --open-registration`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		catalogItemName := args[0]

		catalogItem, err := apiClient.FindCatalogItem(catalogItemName)
		if err != nil {
			return err
		}

		endDate, err := parseEndDate(workshopEndDate, catalogItem.Spec.Lifespan)
		if err != nil {
			return fmt.Errorf("invalid --end-date: %w", err)
		}

		// Parse parameters
		params := make(map[string]interface{})
		paramSchemas := make(map[string]string)
		for _, p := range catalogItem.Spec.Parameters {
			if p.OpenAPIV3Schema != nil && p.OpenAPIV3Schema.Type != "" {
				paramSchemas[p.Name] = p.OpenAPIV3Schema.Type
			}
		}
		for _, p := range workshopParams {
			parts := strings.SplitN(p, "=", 2)
			if len(parts) != 2 {
				return fmt.Errorf("invalid parameter format %q, expected key=value", p)
			}
			key, raw := parts[0], parts[1]
			params[key] = convertParamValue(raw, paramSchemas[key])
		}

		password := workshopAccessPassword
		if password == "" {
			password = api.GeneratePassword(8)
		}

		workshop, err := apiClient.CreateWorkshop(
			catalogItem,
			namespace,
			workshopSeats,
			workshopDisplayName,
			password,
			workshopOpenRegistration,
			endDate,
			params,
		)
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), workshop, func(w io.Writer) {
			fmt.Fprintf(w, "Workshop created successfully.\n\n")
			fmt.Fprintf(w, "Name:      %s\n", workshop.Metadata.Name)
			fmt.Fprintf(w, "Display:   %s\n", api.WorkshopDisplayName(workshop))
			fmt.Fprintf(w, "Namespace: %s\n", workshop.Metadata.Namespace)
			fmt.Fprintf(w, "Catalog:   %s\n", catalogItemName)
			fmt.Fprintf(w, "Seats:     %d\n", workshopSeats)
			fmt.Fprintf(w, "Password:  %s\n", password)
			fmt.Fprintf(w, "Expires:   %s\n", endDate.Format(time.RFC3339))
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
	workshopCreateCmd.Flags().StringVar(&workshopEndDate, "end-date", "", "workshop end date (duration like '72h'/'3d' or date like '2024-12-31')")
	workshopCreateCmd.Flags().StringArrayVar(&workshopParams, "param", nil, "parameter in key=value format (repeatable)")
}
