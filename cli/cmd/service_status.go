package cmd

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var serviceStatusCmd = &cobra.Command{
	Use:   "status <service-name>",
	Short: "Show the status of a service",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		claim, err := apiClient.GetResourceClaim(namespace, name)
		if err != nil {
			return err
		}

		return output.Print(getOutputFormat(), claim, func(w io.Writer) {
			printServiceStatus(w, claim)
		})
	},
}

func printServiceStatus(w io.Writer, rc *types.ResourceClaim) {
	fmt.Fprintf(w, "Name:        %s\n", rc.Metadata.Name)
	fmt.Fprintf(w, "Display:     %s\n", api.DisplayName(rc))
	fmt.Fprintf(w, "Namespace:   %s\n", rc.Metadata.Namespace)
	fmt.Fprintf(w, "Created:     %s\n", rc.Metadata.CreationTimestamp)

	if rc.Metadata.Labels != nil {
		if ciName, ok := rc.Metadata.Labels[types.BabylonDomain+"/catalogItemName"]; ok {
			fmt.Fprintf(w, "Catalog:     %s\n", ciName)
		}
	}

	if rc.Status != nil {
		if rc.Status.Summary != nil {
			fmt.Fprintf(w, "State:       %s\n", rc.Status.Summary.State)
			if rc.Status.Summary.ErrorMessage != "" {
				fmt.Fprintf(w, "Error:       %s\n", rc.Status.Summary.ErrorMessage)
			}
		}

		if rc.Status.Lifespan != nil {
			if rc.Status.Lifespan.Start != "" {
				fmt.Fprintf(w, "Start:       %s\n", rc.Status.Lifespan.Start)
			}
			if rc.Status.Lifespan.End != "" {
				fmt.Fprintf(w, "End:         %s\n", rc.Status.Lifespan.End)
			}
		}

		if rc.Status.ResourceHandle != nil {
			fmt.Fprintf(w, "Handle:      %s\n", rc.Status.ResourceHandle.Name)
		}

		if len(rc.Status.Resources) > 0 {
			fmt.Fprintf(w, "\nResources:\n")
			t := output.NewTable("NAME", "STATE", "HEALTHY")
			for _, r := range rc.Status.Resources {
				state := ""
				healthy := ""
				if r.State != nil && r.State.Spec.Vars != nil {
					state = r.State.Spec.Vars.CurrentState
					if r.State.Spec.Vars.Healthy != nil {
						if *r.State.Spec.Vars.Healthy {
							healthy = "yes"
						} else {
							healthy = "no"
						}
					}
				}
				rName := r.Name
				if rName == "" && r.Provider != nil {
					rName = r.Provider.Name
				}
				t.AddRow(rName, state, healthy)
			}
			t.Render(w)
		}
	}

	if rc.Spec.Provider != nil {
		fmt.Fprintf(w, "\nProvider:     %s\n", rc.Spec.Provider.Name)
	}

	if rc.Spec.Lifespan != nil {
		if rc.Spec.Lifespan.End != "" {
			fmt.Fprintf(w, "Lifespan End: %s\n", rc.Spec.Lifespan.End)
		}
	}
}

func init() {
	serviceCmd.AddCommand(serviceStatusCmd)
}
