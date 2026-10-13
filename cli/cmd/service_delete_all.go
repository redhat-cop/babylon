package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
)

var deleteAllYes bool

var serviceDeleteAllCmd = &cobra.Command{
	Use:   "delete-all",
	Short: "Delete all services in your namespace",
	Long: `Delete all services (ResourceClaims) in your own namespace.
This command only operates on your user namespace to prevent accidental
deletion of services in shared namespaces. The --namespace flag is ignored.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Always use the user's own namespace for safety
		userNs := apiClient.UserNamespace()
		if userNs == "" {
			return fmt.Errorf("could not determine user namespace from session")
		}

		claims, err := apiClient.ListAllResourceClaims(userNs)
		if err != nil {
			return err
		}

		if len(claims) == 0 {
			fmt.Println("No services found in your namespace.")
			return nil
		}

		// Show what will be deleted
		fmt.Printf("The following %d service(s) in namespace %q will be deleted:\n\n", len(claims), userNs)
		for _, rc := range claims {
			state := ""
			if rc.Status != nil && rc.Status.Summary != nil {
				state = rc.Status.Summary.State
			}
			fmt.Printf("  - %s (%s) [%s]\n", rc.Metadata.Name, api.DisplayName(&rc), state)
		}
		fmt.Println()

		// Confirm
		if !deleteAllYes {
			fmt.Print("Are you sure you want to delete all these services? [y/N] ")
			reader := bufio.NewReader(os.Stdin)
			response, _ := reader.ReadString('\n')
			response = strings.TrimSpace(strings.ToLower(response))
			if response != "y" && response != "yes" {
				fmt.Println("Aborted.")
				return nil
			}
		}

		// Delete each service
		var errors []string
		deleted := 0
		for _, rc := range claims {
			if err := apiClient.DeleteResourceClaim(userNs, rc.Metadata.Name); err != nil {
				errors = append(errors, fmt.Sprintf("  %s: %v", rc.Metadata.Name, err))
			} else {
				deleted++
				fmt.Printf("Deleted %s\n", rc.Metadata.Name)
			}
		}

		fmt.Printf("\n%d/%d service(s) deleted.\n", deleted, len(claims))

		if len(errors) > 0 {
			fmt.Fprintf(os.Stderr, "\nErrors:\n%s\n", strings.Join(errors, "\n"))
			return fmt.Errorf("%d service(s) failed to delete", len(errors))
		}

		return nil
	},
}

func init() {
	serviceCmd.AddCommand(serviceDeleteAllCmd)
	serviceDeleteAllCmd.Flags().BoolVar(&deleteAllYes, "yes", false, "skip confirmation prompt")
}
