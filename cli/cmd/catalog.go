package cmd

import "github.com/spf13/cobra"

var catalogCmd = &cobra.Command{
	Use:   "catalog",
	Short: "Browse and inspect the service catalog",
	Long:  "Commands for listing and describing available catalog items.",
}

func init() {
	rootCmd.AddCommand(catalogCmd)
}
