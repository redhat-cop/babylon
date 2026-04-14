package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var serviceDeleteCmd = &cobra.Command{
	Use:   "delete <service-name>",
	Short: "Delete a service",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		if err := apiClient.DeleteResourceClaim(namespace, name); err != nil {
			return err
		}

		fmt.Printf("Service %q deleted.\n", name)
		return nil
	},
}

func init() {
	serviceCmd.AddCommand(serviceDeleteCmd)
}
