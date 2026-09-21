package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
)

var serviceDeleteYes bool

var serviceDeleteCmd = &cobra.Command{
	Use:   "delete <service-name>",
	Short: "Delete a service",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		if !serviceDeleteYes {
			fmt.Printf("This will delete service %q.\n", name)
			fmt.Print("Continue? [y/N] ")
			reader := bufio.NewReader(os.Stdin)
			answer, _ := reader.ReadString('\n')
			answer = strings.TrimSpace(strings.ToLower(answer))
			if answer != "y" && answer != "yes" {
				fmt.Println("Cancelled.")
				return nil
			}
		}

		if err := apiClient.DeleteResourceClaim(namespace, name); err != nil {
			return err
		}

		fmt.Printf("Service %q deleted.\n", name)
		return nil
	},
}

func init() {
	serviceCmd.AddCommand(serviceDeleteCmd)
	serviceDeleteCmd.Flags().BoolVar(&serviceDeleteYes, "yes", false, "skip confirmation prompt")
}
