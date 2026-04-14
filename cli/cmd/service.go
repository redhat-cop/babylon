package cmd

import "github.com/spf13/cobra"

var serviceCmd = &cobra.Command{
	Use:     "service",
	Aliases: []string{"svc"},
	Short:   "Manage your provisioned services",
	Long:    "Commands for listing, starting, stopping, and managing provisioned services.",
}

func init() {
	rootCmd.AddCommand(serviceCmd)
}
