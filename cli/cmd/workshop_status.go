package cmd

import (
	"fmt"
	"io"
	"os"
	"sort"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var workshopStatusWatch bool
var workshopStatusInterval int

var workshopStatusCmd = &cobra.Command{
	Use:   "status <workshop-name>",
	Short: "Show workshop provisioning status",
	Long: `Show detailed provisioning status for a workshop, including per-seat state.

Use --watch to poll until all seats are ready and measure total provisioning time.

Examples:
  babylon workshop status my-workshop-jntrj
  babylon workshop status my-workshop-jntrj --watch
  babylon workshop status my-workshop-jntrj --watch --interval 5
  babylon workshop status my-workshop-jntrj -o json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		if workshopStatusWatch {
			return watchWorkshopStatus(name)
		}

		ws, services, err := fetchWorkshopStatus(name)
		if err != nil {
			return err
		}

		// Fetch full AnarchySubjects for provisioning timestamps
		provisionTimes := fetchProvisionTimes(services)

		data := workshopStatusData{Workshop: ws, Services: services}
		return output.Print(getOutputFormat(), data, func(w io.Writer) {
			printWorkshopStatus(w, ws, services, provisionTimes)
		})
	},
}

type workshopStatusData struct {
	Workshop *types.Workshop       `json:"workshop" yaml:"workshop"`
	Services []types.ResourceClaim `json:"services" yaml:"services"`
}

func fetchWorkshopStatus(name string) (*types.Workshop, []types.ResourceClaim, error) {
	ws, err := apiClient.GetWorkshop(namespace, name)
	if err != nil {
		return nil, nil, err
	}

	services, err := apiClient.ListWorkshopServices(namespace, name)
	if err != nil {
		return nil, nil, err
	}

	sort.Slice(services, func(i, j int) bool {
		return services[i].Metadata.CreationTimestamp < services[j].Metadata.CreationTimestamp
	})

	return ws, services, nil
}

// fetchProvisionTimes fetches the full AnarchySubject for each service to get
// towerJobs.provision.completeTimestamp (not included in the ResourceClaim response).
func fetchProvisionTimes(services []types.ResourceClaim) map[string]time.Time {
	times := make(map[string]time.Time)
	for _, svc := range services {
		if svc.Status == nil {
			continue
		}
		for _, r := range svc.Status.Resources {
			if r.State == nil || r.State.Metadata.Name == "" {
				continue
			}
			subject, err := apiClient.GetAnarchySubject(r.State.Metadata.Namespace, r.State.Metadata.Name)
			if err != nil {
				continue
			}
			if subject.Status != nil && subject.Status.TowerJobs != nil {
				if job, ok := subject.Status.TowerJobs["provision"]; ok && job.CompleteTimestamp != "" {
					if t, err := time.Parse(time.RFC3339, job.CompleteTimestamp); err == nil {
						times[svc.Metadata.Name] = t
					}
				}
			}
		}
	}
	return times
}

func watchWorkshopStatus(name string) error {
	startTime := time.Now()
	interval := time.Duration(workshopStatusInterval) * time.Second

	for {
		ws, services, err := fetchWorkshopStatus(name)
		if err != nil {
			return err
		}

		readyCount, total := countReady(services)
		elapsed := time.Since(startTime).Truncate(time.Second)

		// Clear line and print progress
		fmt.Fprintf(os.Stderr, "\r\033[KProvisioning:  %d/%d ready  (%s elapsed)", readyCount, total, elapsed)

		if total > 0 && readyCount == total {
			fmt.Fprintf(os.Stderr, "\n")

			provisionTimes := fetchProvisionTimes(services)

			printWorkshopStatus(os.Stdout, ws, services, provisionTimes)
			fmt.Fprintf(os.Stdout, "\nAll %d seats ready in %s\n", total, elapsed)
			return nil
		}

		time.Sleep(interval)
	}
}

func countReady(services []types.ResourceClaim) (int, int) {
	ready := 0
	for _, svc := range services {
		if seatState(&svc) == "started" {
			ready++
		}
	}
	return ready, len(services)
}

func printWorkshopStatus(w io.Writer, ws *types.Workshop, services []types.ResourceClaim, provisionTimes map[string]time.Time) {
	fmt.Fprintf(w, "Workshop:    %s\n", ws.Metadata.Name)
	fmt.Fprintf(w, "Display:     %s\n", api.WorkshopDisplayName(ws))
	fmt.Fprintf(w, "Namespace:   %s\n", ws.Metadata.Namespace)
	fmt.Fprintf(w, "Requested:   %s\n", ws.Metadata.CreationTimestamp)
	if ws.Spec.Lifespan != nil && ws.Spec.Lifespan.End != "" {
		fmt.Fprintf(w, "Expires:     %s\n", ws.Spec.Lifespan.End)
	}
	if ws.Spec.AccessPassword != "" {
		fmt.Fprintf(w, "Password:    %s\n", ws.Spec.AccessPassword)
	}

	readyCount, total := countReady(services)
	fmt.Fprintf(w, "\nProvisioning:  %d/%d ready\n", readyCount, total)

	if total > 0 {
		t := output.NewTable("SEAT", "STATE", "PROVISIONED", "AGE")
		for i, svc := range services {
			provisioned := "-"
			if pt, ok := provisionTimes[svc.Metadata.Name]; ok {
				provisioned = pt.Format(time.RFC3339)
			}
			t.AddRow(
				fmt.Sprintf("%d", i+1),
				seatState(&svc),
				provisioned,
				formatWorkshopAge(svc.Metadata.CreationTimestamp),
			)
		}
		t.Render(w)
	}

	// Timing summary
	requestedAt, _ := time.Parse(time.RFC3339, ws.Metadata.CreationTimestamp)
	if requestedAt.IsZero() || len(provisionTimes) == 0 {
		return
	}

	var firstReady, lastReady time.Time
	for _, pt := range provisionTimes {
		if firstReady.IsZero() || pt.Before(firstReady) {
			firstReady = pt
		}
		if lastReady.IsZero() || pt.After(lastReady) {
			lastReady = pt
		}
	}

	fmt.Fprintln(w)
	if !firstReady.IsZero() {
		fmt.Fprintf(w, "First ready:   %s  (%s after request)\n",
			firstReady.Format(time.RFC3339), firstReady.Sub(requestedAt).Truncate(time.Second))
	}
	if !lastReady.IsZero() && len(provisionTimes) == total {
		fmt.Fprintf(w, "Last ready:    %s  (%s after request)\n",
			lastReady.Format(time.RFC3339), lastReady.Sub(requestedAt).Truncate(time.Second))
	}
}

func seatState(svc *types.ResourceClaim) string {
	if svc.Status != nil {
		for _, r := range svc.Status.Resources {
			if r.State != nil && r.State.Spec.Vars != nil && r.State.Spec.Vars.CurrentState != "" {
				return r.State.Spec.Vars.CurrentState
			}
		}
		if svc.Status.Summary != nil && svc.Status.Summary.State != "" {
			return svc.Status.Summary.State
		}
	}
	return "pending"
}

func init() {
	workshopCmd.AddCommand(workshopStatusCmd)
	workshopStatusCmd.Flags().BoolVarP(&workshopStatusWatch, "watch", "w", false, "poll until all seats are ready")
	workshopStatusCmd.Flags().IntVar(&workshopStatusInterval, "interval", 10, "polling interval in seconds (with --watch)")
}
