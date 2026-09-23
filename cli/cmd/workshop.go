package cmd

import "github.com/spf13/cobra"

var workshopCmd = &cobra.Command{
	Use:     "workshop",
	Aliases: []string{"ws"},
	Short:   "Manage workshops",
	Long:    "Commands for creating, listing, and deleting workshops.",
}

func init() {
	rootCmd.AddCommand(workshopCmd)
}
