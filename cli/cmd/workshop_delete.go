package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
)

var workshopDeleteYes bool

var workshopDeleteCmd = &cobra.Command{
	Use:   "delete <workshop-name>",
	Short: "Delete a workshop",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		if !workshopDeleteYes {
			ws, err := apiClient.GetWorkshop(namespace, name)
			if err != nil {
				return err
			}

			fmt.Printf("Workshop:  %s\n", ws.Metadata.Name)
			fmt.Printf("Display:   %s\n", api.WorkshopDisplayName(ws))
			fmt.Printf("Namespace: %s\n", ws.Metadata.Namespace)
			fmt.Printf("\nThis will delete the workshop and all its provisions and user assignments.\n")
			fmt.Print("Continue? [y/N] ")

			reader := bufio.NewReader(os.Stdin)
			answer, _ := reader.ReadString('\n')
			answer = strings.TrimSpace(strings.ToLower(answer))
			if answer != "y" && answer != "yes" {
				fmt.Println("Cancelled.")
				return nil
			}
		}

		if err := apiClient.DeleteWorkshop(namespace, name); err != nil {
			return err
		}

		fmt.Printf("Workshop %q deleted.\n", name)
		return nil
	},
}

func init() {
	workshopCmd.AddCommand(workshopDeleteCmd)
	workshopDeleteCmd.Flags().BoolVar(&workshopDeleteYes, "yes", false, "skip confirmation prompt")
}
