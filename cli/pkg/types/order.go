package types

import "encoding/json"

// Catalog item order phases (see docs/Catalog_Item_Orders.md).
const (
	OrderPhaseSubmitted       = "Submitted"
	OrderPhasePendingApproval = "PendingApproval"
	OrderPhaseApproved        = "Approved"
	OrderPhaseDenied          = "Denied"
	OrderPhaseExpired         = "Expired"
	OrderPhaseCancelled       = "Cancelled"
	OrderPhaseBlocked         = "Blocked"
)

// Catalog item order types accepted by the order API.
const (
	OrderTypeService  = "service"
	OrderTypeWorkshop = "workshop"
)

// OrderSubmission is the body of POST /api/catalog-item-orders. It never
// carries identity, approval state or Kubernetes manifests.
type OrderSubmission struct {
	IdempotencyKey   string                 `json:"idempotencyKey"`
	CatalogItem      OrderCatalogItemRef    `json:"catalogItem"`
	Namespace        string                 `json:"namespace"`
	OrderType        string                 `json:"orderType"`
	Purpose          string                 `json:"purpose,omitempty"`
	Explanation      string                 `json:"explanation,omitempty"`
	SkipSalesforceID bool                   `json:"skipSalesforceId,omitempty"`
	Parameters       map[string]interface{} `json:"parameters,omitempty"`
	Schedule         *OrderSchedule         `json:"schedule,omitempty"`
	Workshop         *OrderWorkshopOptions  `json:"workshop,omitempty"`
}

type OrderCatalogItemRef struct {
	Name      string `json:"name" yaml:"name"`
	Namespace string `json:"namespace" yaml:"namespace"`
}

// OrderSchedule holds explicit times. Omitted values use the catalog item
// defaults, counted from when the order is dispatched (after any approval).
type OrderSchedule struct {
	End string `json:"end,omitempty"`
}

type OrderWorkshopOptions struct {
	Count            int    `json:"count"`
	Concurrency      int    `json:"concurrency,omitempty"`
	DisplayName      string `json:"displayName,omitempty"`
	AccessPassword   string `json:"accessPassword,omitempty"`
	OpenRegistration bool   `json:"openRegistration"`
}

// CatalogItemOrder is the order view returned by the order API. Raw keeps the
// full response for JSON and YAML output.
type CatalogItemOrder struct {
	Name        string              `json:"name"`
	Namespace   string              `json:"namespace"`
	UID         string              `json:"uid"`
	Phase       string              `json:"phase"`
	OrderType   string              `json:"orderType"`
	CatalogItem OrderCatalogItemRef `json:"catalogItem"`
	Requester   string              `json:"requester"`
	SubmittedAt string              `json:"submittedAt"`
	CompletedAt string              `json:"completedAt"`
	Approval    OrderApproval       `json:"approval"`
	Policy      OrderPolicy         `json:"policy"`
	Blocked     *OrderBlocked       `json:"blocked"`
	Conditions  []OrderCondition    `json:"conditions"`
	Attempts    []OrderAttempt      `json:"attempts"`
	Cancel      *OrderCancel        `json:"cancel"`

	Raw json.RawMessage `json:"-"`
}

type OrderApproval struct {
	State       string                 `json:"state"`
	RequestedAt string                 `json:"requestedAt"`
	ExpiresAt   string                 `json:"expiresAt"`
	ReviewURL   string                 `json:"reviewUrl"`
	Decision    *OrderApprovalDecision `json:"decision"`
	Manager     *OrderApprovalManager  `json:"manager"`
	Exemption   *OrderExemption        `json:"exemption"`
}

type OrderApprovalDecision struct {
	Outcome   string `json:"outcome"`
	DecidedBy string `json:"decidedBy"`
	DecidedAt string `json:"decidedAt"`
	Comment   string `json:"comment"`
}

type OrderApprovalManager struct {
	State         string        `json:"state"`
	Message       string        `json:"message"`
	DirectManager *OrderManager `json:"directManager"`
}

type OrderManager struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

type OrderExemption struct {
	Reason string `json:"reason"`
}

type OrderPolicy struct {
	MatchedRules []OrderMatchedRule `json:"matchedRules"`
}

type OrderMatchedRule struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

type OrderBlocked struct {
	Reason      string `json:"reason"`
	Message     string `json:"message"`
	Recoverable bool   `json:"recoverable"`
}

type OrderCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type OrderAttempt struct {
	State     string            `json:"state"`
	Resources []ObjectReference `json:"resources"`
}

type OrderCancel struct {
	Allowed bool   `json:"allowed"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// CreatedResource returns the first created resource of the given kind, or nil.
func (o *CatalogItemOrder) CreatedResource(kind string) *ObjectReference {
	for i := len(o.Attempts) - 1; i >= 0; i-- {
		for j := range o.Attempts[i].Resources {
			ref := &o.Attempts[i].Resources[j]
			if ref.Kind == kind && ref.UID != "" {
				return ref
			}
		}
	}
	return nil
}

// Final reports whether the order will not change on its own any more.
func (o *CatalogItemOrder) Final() bool {
	switch o.Phase {
	case OrderPhaseDenied, OrderPhaseExpired, OrderPhaseCancelled:
		return true
	case OrderPhaseBlocked:
		return o.Blocked == nil || !o.Blocked.Recoverable
	case OrderPhaseApproved:
		return o.CompletedAt != ""
	}
	return false
}
