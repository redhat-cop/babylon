package cmd

import (
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var catalogListCategory string

var catalogListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available catalog items",
	RunE: func(cmd *cobra.Command, args []string) error {
		namespaces := apiClient.CatalogNamespaces()
		if cmd.Flags().Changed("namespace") {
			namespaces = []string{namespace}
		}

		items, err := apiClient.ListAllCatalogItems(namespaces)
		if err != nil {
			return err
		}

		// Filter by category if specified
		if catalogListCategory != "" {
			filtered := make([]types.CatalogItem, 0)
			for _, item := range items {
				if strings.EqualFold(item.Spec.Category, catalogListCategory) {
					filtered = append(filtered, item)
				}
			}
			items = filtered
		}

		return output.Print(getOutputFormat(), items, func(w io.Writer) {
			if len(items) == 0 {
				output.PrintMessage(w, "No catalog items found.")
				return
			}
			t := output.NewTable("NAME", "DISPLAY NAME", "CATEGORY", "NAMESPACE")
			for _, item := range items {
				displayName := item.Spec.DisplayName
				if displayName == "" {
					displayName = item.Metadata.Name
				}
				t.AddRow(
					item.Metadata.Name,
					displayName,
					item.Spec.Category,
					item.Metadata.Namespace,
				)
			}
			t.Render(w)
			fmt.Fprintf(w, "\n%d catalog item(s)\n", len(items))
		})
	},
}

func init() {
	catalogCmd.AddCommand(catalogListCmd)
	catalogListCmd.Flags().StringVar(&catalogListCategory, "category", "", "filter by category")
}
