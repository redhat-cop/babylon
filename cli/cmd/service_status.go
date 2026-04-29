package cmd

import (
	"fmt"
	"io"
	"sort"
	"strings"

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
			fmt.Fprintf(w, "Handle:      %s/%s\n", rc.Status.ResourceHandle.Namespace, rc.Status.ResourceHandle.Name)
		}

		if len(rc.Status.Resources) > 0 {
			fmt.Fprintf(w, "\nResources:\n")
			t := output.NewTable("NAME", "STATE", "HEALTHY", "GOVERNOR", "GUID")
			for _, r := range rc.Status.Resources {
				state := ""
				healthy := ""
				governor := ""
				guid := ""
				if r.State != nil {
					governor = r.State.Spec.Governor
					if r.State.Spec.Vars != nil {
						state = r.State.Spec.Vars.CurrentState
						if r.State.Spec.Vars.Healthy != nil {
							if *r.State.Spec.Vars.Healthy {
								healthy = "yes"
							} else {
								healthy = "no"
							}
						}
						if r.State.Spec.Vars.JobVars != nil {
							guid = r.State.Spec.Vars.JobVars.GUID
						}
					}
				}
				rName := r.Name
				if rName == "" && r.Provider != nil {
					rName = r.Provider.Name
				}
				t.AddRow(rName, state, healthy, governor, guid)
			}
			t.Render(w)

			// Print tower jobs per resource
			for _, r := range rc.Status.Resources {
				if r.State == nil || r.State.Status == nil || len(r.State.Status.TowerJobs) == 0 {
					continue
				}
				rName := r.Name
				if rName == "" && r.State.Metadata.Name != "" {
					rName = r.State.Metadata.Name
				}
				fmt.Fprintf(w, "\n  Tower Jobs (%s):\n", rName)
				jt := output.NewTable("ACTION", "STARTED", "COMPLETED")
				for action, job := range r.State.Status.TowerJobs {
					jt.AddRow(action, job.StartTimestamp, job.CompleteTimestamp)
				}
				jt.Render(w)
			}
		}

		// Provision data: prefer summary, fall back to per-resource
		provisionData := mergeProvisionData(rc)
		if len(provisionData) > 0 {
			fmt.Fprintf(w, "\nProvision Data:\n")
			keys := sortedKeys(provisionData)
			for _, k := range keys {
				v := provisionData[k]
				switch val := v.(type) {
				case map[string]interface{}:
					// Nested map (e.g. users)
					fmt.Fprintf(w, "  %s:\n", k)
					for uk, uv := range val {
						fmt.Fprintf(w, "    %s: %v\n", uk, uv)
					}
				default:
					fmt.Fprintf(w, "  %s: %v\n", k, val)
				}
			}
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

	// URL from annotations
	if rc.Metadata.Annotations != nil {
		if url, ok := rc.Metadata.Annotations[types.BabylonDomain+"/url"]; ok {
			fmt.Fprintf(w, "URL:         %s\n", url)
		}
	}
}

// mergeProvisionData collects provision_data from summary and per-resource AnarchySubjects.
func mergeProvisionData(rc *types.ResourceClaim) map[string]interface{} {
	merged := make(map[string]interface{})
	if rc.Status == nil {
		return merged
	}

	// Per-resource provision data
	for _, r := range rc.Status.Resources {
		if r.State != nil && r.State.Spec.Vars != nil && r.State.Spec.Vars.ProvisionData != nil {
			for k, v := range r.State.Spec.Vars.ProvisionData {
				merged[k] = v
			}
		}
	}

	// Summary provision data takes precedence
	if rc.Status.Summary != nil && rc.Status.Summary.ProvisionData != nil {
		for k, v := range rc.Status.Summary.ProvisionData {
			merged[k] = v
		}
	}

	// Filter out internal/noisy keys
	for _, k := range []string{"__meta__"} {
		delete(merged, k)
	}

	return merged
}

func sortedKeys(m map[string]interface{}) []string {
	// Show URL-like keys first, then alphabetical
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		iURL := isURLKey(keys[i])
		jURL := isURLKey(keys[j])
		if iURL != jURL {
			return iURL
		}
		return keys[i] < keys[j]
	})
	return keys
}

func isURLKey(k string) bool {
	lower := strings.ToLower(k)
	return strings.Contains(lower, "url") || strings.Contains(lower, "endpoint") || strings.Contains(lower, "console")
}

func init() {
	serviceCmd.AddCommand(serviceStatusCmd)
}
