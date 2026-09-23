package cmd

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var serviceRetireCmd = &cobra.Command{
	Use:   "retire <service-name>",
	Short: "Retire a service (set lifespan end to now)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		claim, err := apiClient.RetireResourceClaim(namespace, name)
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), claim, func(w io.Writer) {
			fmt.Fprintf(w, "Service %q retirement requested.\n", api.DisplayName(claim))
		})
	},
}

func init() {
	serviceCmd.AddCommand(serviceRetireCmd)
}
