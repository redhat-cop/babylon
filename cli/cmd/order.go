package cmd

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// defaultOrderWait is how long ordering commands wait for an order to be
// created or to need approval before returning.
const defaultOrderWait = 60 * time.Second

// orderPollInterval is how often a waiting command re-reads the order.
var orderPollInterval = 2 * time.Second

var orderCmd = &cobra.Command{
	Use:   "order",
	Short: "Follow and cancel catalog item orders",
	Long: `Services and workshops are ordered through catalog item orders. An order is
created first; the catalog creates the service or workshop once any required
manager approval is given.

Examples:
  babylon order list
  babylon order status order-1a2b3c4d5e6f
  babylon order cancel order-1a2b3c4d5e6f`,
}

var orderListCmd = &cobra.Command{
	Use:   "list",
	Short: "List your orders",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		listNamespace := ""
		if cmd.Flags().Changed("namespace") {
			listNamespace = namespace
		}
		orders, raw, err := apiClient.ListOrders(listNamespace)
		if err != nil {
			return err
		}
		return output.Print(getOutputFormat(), raw, func(w io.Writer) {
			if len(orders) == 0 {
				output.PrintMessage(w, "No orders found.")
				return
			}
			table := output.NewTable("NAME", "NAMESPACE", "CATALOG ITEM", "TYPE", "PHASE", "APPROVAL", "SUBMITTED")
			for _, order := range orders {
				table.AddRow(order.Name, order.Namespace, order.CatalogItem.Name, order.OrderType,
					order.Phase, orDash(order.Approval.State), orDash(order.SubmittedAt))
			}
			table.Render(w)
		})
	},
}

var orderStatusCmd = &cobra.Command{
	Use:   "status <order-name>",
	Short: "Show an order, its approval and what it created",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		order, err := apiClient.GetOrder(namespace, args[0])
		if err != nil {
			return err
		}
		return output.Print(getOutputFormat(), order.Raw, func(w io.Writer) {
			printOrderDetails(w, order)
		})
	},
}

var orderCancelCmd = &cobra.Command{
	Use:   "cancel <order-name>",
	Short: "Cancel an order before anything is created",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		order, err := apiClient.CancelOrder(namespace, args[0])
		if err != nil {
			return err
		}
		return output.Print(getOutputFormat(), order.Raw, func(w io.Writer) {
			fmt.Fprintf(w, "Order %s cancelled. Nothing was created.\n", order.Name)
		})
	},
}

func init() {
	rootCmd.AddCommand(orderCmd)
	orderCmd.AddCommand(orderListCmd, orderStatusCmd, orderCancelCmd)
}

// placeOrder submits an order and waits up to `wait` for it to be created,
// to need approval, or to end.
func placeOrder(cmd *cobra.Command, submission *types.OrderSubmission, wait time.Duration) (*types.CatalogItemOrder, error) {
	key, err := api.NewIdempotencyKey()
	if err != nil {
		return nil, err
	}
	submission.IdempotencyKey = key
	order, err := apiClient.SubmitOrder(submission)
	if err != nil {
		return nil, fmt.Errorf("order not submitted: %w", err)
	}
	ctx := context.Background()
	if cmd != nil && cmd.Context() != nil {
		ctx = cmd.Context()
	}
	latest, err := apiClient.WaitForOrder(ctx, order, wait, orderPollInterval)
	if err != nil && cmd != nil {
		// The order exists; report it instead of failing the command.
		fmt.Fprintf(cmd.ErrOrStderr(), "Warning: could not follow order %s: %v\n", order.Name, err)
	}
	return latest, nil
}

// printPlacedOrder prints the outcome of placeOrder. Once the order created
// everything (completedAt), structured output is the resource of `kind`, as
// before orders; otherwise it is the order, so a Workshop whose
// WorkshopProvision does not exist yet is never reported as created. Denied,
// expired, cancelled and permanently blocked orders return an error after
// printing.
func printPlacedOrder(order *types.CatalogItemOrder, kind string, printCreated func(w io.Writer, resource interface{})) error {
	if ref := order.CreatedResource(kind); ref != nil && order.CompletedAt != "" {
		var resource interface{}
		var err error
		switch kind {
		case "Workshop":
			resource, err = apiClient.GetWorkshop(ref.Namespace, ref.Name)
		default:
			resource, err = apiClient.GetResourceClaim(ref.Namespace, ref.Name)
		}
		if err != nil {
			return fmt.Errorf("order %s created %s %s, but reading it failed: %w", order.Name, kind, ref.Name, err)
		}
		return output.Print(getOutputFormat(), resource, func(w io.Writer) {
			printCreated(w, resource)
			fmt.Fprintf(w, "Order:     %s\n", order.Name)
		})
	}
	if err := output.Print(getOutputFormat(), order.Raw, func(w io.Writer) {
		printOrderOutcome(w, order)
	}); err != nil {
		return err
	}
	return orderFailure(order)
}

func printOrderOutcome(w io.Writer, order *types.CatalogItemOrder) {
	switch {
	case order.Phase == types.OrderPhasePendingApproval:
		fmt.Fprintf(w, "Order submitted. It needs manager approval before anything is created.\n\n")
		printOrderDetails(w, order)
		fmt.Fprintf(w, "\nNothing is created until the order is approved. Use 'babylon order status %s' to follow it.\n", order.Name)
	case order.Final():
		printOrderDetails(w, order)
	default:
		fmt.Fprintf(w, "Order submitted and still being processed.\n\n")
		printOrderDetails(w, order)
		fmt.Fprintf(w, "\nUse 'babylon order status %s' to follow it.\n", order.Name)
	}
}

func orderFailure(order *types.CatalogItemOrder) error {
	switch order.Phase {
	case types.OrderPhaseDenied:
		if d := order.Approval.Decision; d != nil && d.Comment != "" {
			return fmt.Errorf("order %s was denied: %s", order.Name, d.Comment)
		}
		return fmt.Errorf("order %s was denied", order.Name)
	case types.OrderPhaseExpired:
		return fmt.Errorf("order %s expired before it was approved", order.Name)
	case types.OrderPhaseCancelled:
		return fmt.Errorf("order %s was cancelled", order.Name)
	case types.OrderPhaseBlocked:
		if order.Final() && order.Blocked != nil {
			return fmt.Errorf("order %s is blocked: %s", order.Name, order.Blocked.Message)
		}
	}
	return nil
}

func printOrderDetails(w io.Writer, order *types.CatalogItemOrder) {
	fmt.Fprintf(w, "Order:     %s\n", order.Name)
	fmt.Fprintf(w, "Namespace: %s\n", order.Namespace)
	fmt.Fprintf(w, "Catalog:   %s\n", order.CatalogItem.Name)
	fmt.Fprintf(w, "Type:      %s\n", order.OrderType)
	fmt.Fprintf(w, "Phase:     %s\n", order.Phase)
	approval := order.Approval
	if approval.State != "" {
		fmt.Fprintf(w, "Approval:  %s\n", approval.State)
	}
	if approval.Exemption != nil && approval.Exemption.Reason != "" {
		fmt.Fprintf(w, "Exempt:    %s\n", approval.Exemption.Reason)
	}
	var reasons []string
	for _, rule := range order.Policy.MatchedRules {
		if rule.Reason != "" {
			reasons = append(reasons, rule.Reason)
		}
	}
	if len(reasons) > 0 && approval.State != "NotRequired" {
		fmt.Fprintf(w, "Reason:    %s\n", strings.Join(reasons, "; "))
	}
	if m := approval.Manager; m != nil {
		switch {
		case m.DirectManager != nil && m.DirectManager.Email != "":
			manager := m.DirectManager.Email
			if m.DirectManager.Name != "" {
				manager = fmt.Sprintf("%s <%s>", m.DirectManager.Name, m.DirectManager.Email)
			}
			fmt.Fprintf(w, "Manager:   %s\n", manager)
		case m.Message != "":
			fmt.Fprintf(w, "Manager:   %s\n", m.Message)
		}
	}
	if approval.ExpiresAt != "" && order.Phase == types.OrderPhasePendingApproval {
		fmt.Fprintf(w, "Expires:   %s\n", approval.ExpiresAt)
	}
	if approval.ReviewURL != "" && order.Phase == types.OrderPhasePendingApproval {
		fmt.Fprintf(w, "Review:    %s\n", approval.ReviewURL)
	}
	if d := approval.Decision; d != nil {
		fmt.Fprintf(w, "Decision:  %s by %s\n", d.Outcome, d.DecidedBy)
		if d.Comment != "" {
			fmt.Fprintf(w, "Comment:   %s\n", d.Comment)
		}
	}
	if b := order.Blocked; b != nil && order.Phase == types.OrderPhaseBlocked {
		fmt.Fprintf(w, "Blocked:   %s: %s\n", b.Reason, b.Message)
		if b.Recoverable {
			fmt.Fprintf(w, "           The order resumes automatically once this is resolved.\n")
		} else {
			fmt.Fprintf(w, "           Place a new order to try again.\n")
		}
	}
	for _, condition := range order.Conditions {
		if condition.Type == "Dispatched" && condition.Status == "False" && condition.Message != "" && order.CompletedAt == "" {
			fmt.Fprintf(w, "Creating:  %s\n", condition.Message)
		}
	}
	for _, attempt := range order.Attempts {
		for _, ref := range attempt.Resources {
			if ref.UID != "" {
				fmt.Fprintf(w, "Created:   %s %s\n", ref.Kind, ref.Name)
			}
		}
	}
	if order.Cancel != nil && order.Cancel.Allowed {
		fmt.Fprintf(w, "Cancel:    babylon order cancel %s -n %s\n", order.Name, order.Namespace)
	}
}

func orDash(value string) string {
	if value == "" {
		return "-"
	}
	return value
}

// orderInputs turns --purpose, --explanation and --param values into order
// fields. Parameters are validated against the catalog item; only explicitly
// given parameters are sent, because the API applies catalog defaults. The
// purpose fallback matches earlier CLI versions: an explicit --purpose, else a
// purpose parameter or catalog default, else "Development".
func orderInputs(catalogItem *types.CatalogItem, inputs []string, purposeFlag, explanationFlag string) (purpose, explanation string, params map[string]interface{}, err error) {
	all := append([]string(nil), inputs...)
	catalogPurpose := false
	for _, param := range catalogItem.Spec.Parameters {
		if param.Name != "purpose" {
			continue
		}
		catalogPurpose = true
		if purposeFlag != "" {
			all = append(all, "purpose="+purposeFlag)
		} else if param.Value == "" && (param.OpenAPIV3Schema == nil || param.OpenAPIV3Schema.Default == nil) {
			all = append([]string{"purpose=Development"}, all...)
		}
	}
	values, err := parseParameters(all, catalogItem.Spec.Parameters)
	if err != nil {
		return "", "", nil, err
	}

	purpose = purposeFlag
	if catalogPurpose {
		if value, ok := values["purpose"]; ok {
			purpose = fmt.Sprint(value)
		}
	}
	if purpose == "" {
		purpose = "Development"
	}
	explanation = explanationFlag
	for _, input := range inputs {
		if name, value, _ := strings.Cut(input, "="); name == "purpose_explanation" && explanation == "" {
			explanation = value
		}
	}
	if err := checkPurposeOption(catalogItem, purpose, explanation); err != nil {
		return "", "", nil, err
	}

	params = map[string]interface{}{}
	for _, input := range inputs {
		name := strings.SplitN(input, "=", 2)[0]
		switch name {
		case "purpose":
			// Sent as the order purpose.
		case "purpose_explanation":
			// Sent as the order explanation.
		case "purpose_activity", "salesforce_id":
			return "", "", nil, fmt.Errorf("parameter %q is set by the catalog from the order purpose; use --purpose instead", name)
		default:
			params[name] = values[name]
		}
	}
	return purpose, explanation, params, nil
}

// checkPurposeOption validates the purpose against the catalog item's purpose
// options, when it has any, so the user learns the valid choices before the
// order API rejects the request.
func checkPurposeOption(catalogItem *types.CatalogItem, purpose, explanation string) error {
	var options []types.PurposeOption
	for _, param := range catalogItem.Spec.Parameters {
		if param.Name == "purpose" && param.OpenAPIV3Schema != nil {
			options = param.OpenAPIV3Schema.XFormOptions
		}
	}
	if len(options) == 0 {
		return nil
	}
	names := make([]string, len(options))
	for i, option := range options {
		if option.Name == purpose {
			if option.RequireUserInput && explanation == "" {
				return fmt.Errorf("purpose %q requires --explanation", purpose)
			}
			return nil
		}
		names[i] = fmt.Sprintf("%q", option.Name)
	}
	return fmt.Errorf("catalog item %s needs --purpose set to one of: %s", catalogItem.Metadata.Name, strings.Join(names, ", "))
}

// orderSchedule returns an explicit end time for --end-date, or nil so the
// catalog default lifespan applies from when the order is fulfilled.
func orderSchedule(endDateFlag string, catalogItem *types.CatalogItem) (*types.OrderSchedule, *time.Time, error) {
	if endDateFlag == "" {
		return nil, nil, nil
	}
	endDate, err := parseEndDate(endDateFlag, catalogItem.Spec.Lifespan)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid --end-date: %w", err)
	}
	return &types.OrderSchedule{End: endDate.UTC().Format(time.RFC3339)}, &endDate, nil
}
