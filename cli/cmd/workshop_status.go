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

		data := workshopStatusData{Workshop: ws, Services: services}
		return output.Print(getOutputFormat(), data, func(w io.Writer) {
			printWorkshopStatus(w, ws, services)
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
			// Print full status to stdout
			printWorkshopStatus(os.Stdout, ws, services)
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

func printWorkshopStatus(w io.Writer, ws *types.Workshop, services []types.ResourceClaim) {
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
		t := output.NewTable("SEAT", "STATE", "AGE")
		for i, svc := range services {
			t.AddRow(
				fmt.Sprintf("%d", i+1),
				seatState(&svc),
				formatWorkshopAge(svc.Metadata.CreationTimestamp),
			)
		}
		t.Render(w)
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
