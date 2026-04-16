package cmd

import (
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var workshopStatusCmd = &cobra.Command{
	Use:   "status <workshop-name>",
	Short: "Show workshop provisioning status",
	Long: `Show detailed provisioning status for a workshop, including per-seat
state and timing information useful for load testing.

Examples:
  babylon workshop status my-workshop-jntrj
  babylon workshop status my-workshop-jntrj -o json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]

		ws, err := apiClient.GetWorkshop(namespace, name)
		if err != nil {
			return err
		}

		services, err := apiClient.ListWorkshopServices(namespace, name)
		if err != nil {
			return err
		}

		// Sort by creation time
		sort.Slice(services, func(i, j int) bool {
			return services[i].Metadata.CreationTimestamp < services[j].Metadata.CreationTimestamp
		})

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

	// Count ready seats
	readyCount := 0
	for _, svc := range services {
		if seatState(&svc) == "started" {
			readyCount++
		}
	}
	total := len(services)
	fmt.Fprintf(w, "\nProvisioning:  %d/%d ready\n", readyCount, total)

	// Per-seat table
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

	// Timing summary
	requestedAt, _ := time.Parse(time.RFC3339, ws.Metadata.CreationTimestamp)
	if requestedAt.IsZero() || readyCount == 0 {
		return
	}

	var firstReady, lastReady time.Time
	for _, svc := range services {
		if seatState(&svc) != "started" {
			continue
		}
		readyAt := seatReadyTime(&svc)
		if readyAt.IsZero() {
			continue
		}
		if firstReady.IsZero() || readyAt.Before(firstReady) {
			firstReady = readyAt
		}
		if lastReady.IsZero() || readyAt.After(lastReady) {
			lastReady = readyAt
		}
	}

	fmt.Fprintln(w)
	if !firstReady.IsZero() {
		fmt.Fprintf(w, "First ready:   %s  (%s after request)\n",
			firstReady.Format(time.RFC3339), firstReady.Sub(requestedAt).Truncate(time.Second))
	}
	if !lastReady.IsZero() && readyCount == total {
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

func seatReadyTime(svc *types.ResourceClaim) time.Time {
	if svc.Status != nil && svc.Status.Lifespan != nil && svc.Status.Lifespan.Start != "" {
		if t, err := time.Parse(time.RFC3339, svc.Status.Lifespan.Start); err == nil {
			return t
		}
	}
	return time.Time{}
}

func init() {
	workshopCmd.AddCommand(workshopStatusCmd)
}
