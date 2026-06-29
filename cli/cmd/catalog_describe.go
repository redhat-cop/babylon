package cmd

import (
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var catalogDescribeCmd = &cobra.Command{
	Use:   "describe <catalog-item-name>",
	Short: "Show details of a catalog item",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		var ci *types.CatalogItem
		var err error

		// Only use explicit -n flag for catalog lookups, not the default
		// service namespace (which would always 403).
		if cmd.Flags().Changed("namespace") {
			ci, err = apiClient.GetCatalogItem(namespace, name)
		} else {
			ci, err = apiClient.FindCatalogItem(name)
		}
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), ci, func(w io.Writer) {
			printCatalogItemDetails(w, ci)
		})
	},
}

func printCatalogItemDetails(w io.Writer, ci *types.CatalogItem) {
	fmt.Fprintf(w, "Name:        %s\n", ci.Metadata.Name)
	fmt.Fprintf(w, "Namespace:   %s\n", ci.Metadata.Namespace)
	if ci.Spec.DisplayName != "" {
		fmt.Fprintf(w, "Display:     %s\n", ci.Spec.DisplayName)
	}
	if ci.Spec.Category != "" {
		fmt.Fprintf(w, "Category:    %s\n", ci.Spec.Category)
	}

	if ci.Spec.Description != nil && ci.Spec.Description.Content != "" {
		desc := stripTags(ci.Spec.Description.Content)
		if len(desc) > 200 {
			desc = desc[:200] + "..."
		}
		fmt.Fprintf(w, "Description: %s\n", desc)
	}

	if ci.Spec.ProvisionTimeEstimate != "" {
		fmt.Fprintf(w, "Provision:   ~%s\n", ci.Spec.ProvisionTimeEstimate)
	}

	if ci.Spec.Lifespan != nil {
		parts := []string{}
		if ci.Spec.Lifespan.Default != "" {
			parts = append(parts, "default="+ci.Spec.Lifespan.Default)
		}
		if ci.Spec.Lifespan.Maximum != "" {
			parts = append(parts, "max="+ci.Spec.Lifespan.Maximum)
		}
		if len(parts) > 0 {
			fmt.Fprintf(w, "Lifespan:    %s\n", strings.Join(parts, ", "))
		}
	}

	if ci.Spec.Runtime != nil {
		parts := []string{}
		if ci.Spec.Runtime.Default != "" {
			parts = append(parts, "default="+ci.Spec.Runtime.Default)
		}
		if ci.Spec.Runtime.Maximum != "" {
			parts = append(parts, "max="+ci.Spec.Runtime.Maximum)
		}
		if len(parts) > 0 {
			fmt.Fprintf(w, "Runtime:     %s\n", strings.Join(parts, ", "))
		}
	}

	if len(ci.Spec.Keywords) > 0 {
		fmt.Fprintf(w, "Keywords:    %s\n", strings.Join(ci.Spec.Keywords, ", "))
	}

	if ci.Status != nil && ci.Status.Rating > 0 {
		fmt.Fprintf(w, "Rating:      %.1f/5\n", ci.Status.Rating)
	}

	if len(ci.Spec.Parameters) > 0 {
		fmt.Fprintf(w, "\nParameters:\n")
		pt := output.NewTable("NAME", "LABEL", "REQUIRED", "DESCRIPTION")
		for _, p := range ci.Spec.Parameters {
			label := p.FormLabel
			if label == "" {
				label = p.Name
			}
			req := ""
			if p.Required {
				req = "yes"
			}
			pt.AddRow(p.Name, label, req, p.Description)
		}
		pt.Render(w)
	}
}

func stripTags(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func init() {
	catalogCmd.AddCommand(catalogDescribeCmd)
}
