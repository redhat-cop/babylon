package cmd

import (
	"fmt"
	"io"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

var workshopListCmd = &cobra.Command{
	Use:   "list",
	Short: "List your workshops",
	RunE: func(cmd *cobra.Command, args []string) error {
		allWorkshops, err := apiClient.ListAllWorkshops(namespace)
		if err != nil {
			return err
		}

		// Filter out workshops being deleted
		workshops := allWorkshops[:0]
		for _, ws := range allWorkshops {
			if ws.Metadata.DeletionTimestamp == "" {
				workshops = append(workshops, ws)
			}
		}

		return output.Print(getOutputFormat(), workshops, func(w io.Writer) {
			if len(workshops) == 0 {
				output.PrintMessage(w, "No workshops found.")
				return
			}
			t := output.NewTable("NAME", "DISPLAY", "SEATS (USED/TOTAL)", "STATUS", "AGE")
			for _, ws := range workshops {
				t.AddRow(
					ws.Metadata.Name,
					api.WorkshopDisplayName(&ws),
					formatSeats(&ws),
					workshopStatus(&ws),
					formatWorkshopAge(ws.Metadata.CreationTimestamp),
				)
			}
			t.Render(w)
			fmt.Fprintf(w, "\n%d workshop(s)\n", len(workshops))
		})
	},
}

func formatSeats(ws *types.Workshop) string {
	if ws.Status == nil || ws.Status.UserCount == nil {
		return "-/-"
	}
	uc := ws.Status.UserCount
	return fmt.Sprintf("%d/%d", uc.Assigned, uc.Total)
}

func workshopStatus(ws *types.Workshop) string {
	if ws.Status == nil || ws.Status.ProvisionCount == nil {
		return "new"
	}
	pc := ws.Status.ProvisionCount
	if pc.Failed > 0 {
		return fmt.Sprintf("failed(%d)", pc.Failed)
	}
	if pc.Active > 0 && pc.Active == pc.Ordered {
		return "ready"
	}
	if pc.Active > 0 {
		return fmt.Sprintf("provisioning(%d/%d)", pc.Active, pc.Ordered)
	}
	return "provisioning"
}

func formatWorkshopAge(creationTimestamp string) string {
	if creationTimestamp == "" {
		return "-"
	}
	t, err := time.Parse(time.RFC3339, creationTimestamp)
	if err != nil {
		return "-"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

func init() {
	workshopCmd.AddCommand(workshopListCmd)
}
