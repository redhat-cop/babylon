package cmd

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var serviceListCmd = &cobra.Command{
	Use:   "list",
	Short: "List your services",
	RunE: func(cmd *cobra.Command, args []string) error {
		allClaims, err := apiClient.ListAllResourceClaims(namespace)
		if err != nil {
			return err
		}

		// Filter out services that are being deleted
		claims := allClaims[:0]
		for _, rc := range allClaims {
			if rc.Metadata.DeletionTimestamp == "" {
				claims = append(claims, rc)
			}
		}

		return output.Print(getOutputFormat(), claims, func(w io.Writer) {
			if len(claims) == 0 {
				output.PrintMessage(w, "No services found.")
				return
			}
			t := output.NewTable("NAME", "DISPLAY NAME", "STATE", "NAMESPACE", "CREATED")
			for _, rc := range claims {
				state := ""
				if rc.Status != nil && rc.Status.Summary != nil {
					state = rc.Status.Summary.State
				}
				t.AddRow(
					rc.Metadata.Name,
					api.DisplayName(&rc),
					state,
					rc.Metadata.Namespace,
					rc.Metadata.CreationTimestamp,
				)
			}
			t.Render(w)
			fmt.Fprintf(w, "\n%d service(s)\n", len(claims))
		})
	},
}

func init() {
	serviceCmd.AddCommand(serviceListCmd)
}
