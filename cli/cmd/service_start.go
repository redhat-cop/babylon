package cmd

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var serviceStartCmd = &cobra.Command{
	Use:   "start <service-name>",
	Short: "Start a stopped service",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		claim, err := apiClient.StartResourceClaim(namespace, name)
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), claim, func(w io.Writer) {
			fmt.Fprintf(w, "Service %q start requested.\n", api.DisplayName(claim))
			if claim.Status != nil && claim.Status.Summary != nil {
				fmt.Fprintf(w, "State: %s\n", claim.Status.Summary.State)
			}
		})
	},
}

func init() {
	serviceCmd.AddCommand(serviceStartCmd)
}
