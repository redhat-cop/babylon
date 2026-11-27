package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

const ordersPath = "/api/catalog-item-orders"

// submitRetries is how many times a submission is resent after a transport
// error or a gateway error. Resending is safe: the idempotency key makes the
// API return the existing order instead of creating another one.
var submitRetries = 2

// submitRetryDelay is the pause before resending a submission.
var submitRetryDelay = time.Second

// NewIdempotencyKey returns a random idempotency key for one logical order.
func NewIdempotencyKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating idempotency key: %w", err)
	}
	return "cli-" + hex.EncodeToString(b), nil
}

// SubmitOrder submits a CatalogItemOrder. The controller evaluates its approval
// policy and creates the service or workshop once approval is satisfied.
func (c *Client) SubmitOrder(submission *types.OrderSubmission) (*types.CatalogItemOrder, error) {
	if submission.IdempotencyKey == "" {
		return nil, fmt.Errorf("order submission needs an idempotency key")
	}
	var lastErr error
	for attempt := 0; attempt <= submitRetries; attempt++ {
		if attempt > 0 {
			c.debugf("Resending order submission with the same idempotency key (%v)", lastErr)
			time.Sleep(submitRetryDelay)
		}
		data, err := c.post(ordersPath, submission)
		if err == nil {
			return parseOrder(data)
		}
		lastErr = err
		if !retryableSubmitError(err) {
			break
		}
	}
	return nil, lastErr
}

func retryableSubmitError(err error) bool {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		// No HTTP response: the order may or may not have been recorded.
		return true
	}
	switch apiErr.StatusCode {
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	}
	return false
}

// GetOrder returns one of the user's orders.
func (c *Client) GetOrder(namespace, name string) (*types.CatalogItemOrder, error) {
	data, err := c.get(orderPath(namespace, name))
	if err != nil {
		return nil, err
	}
	return parseOrder(data)
}

// ListOrders lists the user's orders, optionally in one namespace.
func (c *Client) ListOrders(namespace string) ([]types.CatalogItemOrder, json.RawMessage, error) {
	path := ordersPath
	if namespace != "" {
		path += "?namespace=" + url.QueryEscape(namespace)
	}
	data, err := c.get(path)
	if err != nil {
		return nil, nil, err
	}
	var list struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, nil, fmt.Errorf("parsing order list: %w", err)
	}
	orders := make([]types.CatalogItemOrder, 0, len(list.Items))
	for _, item := range list.Items {
		order, err := parseOrder(item)
		if err != nil {
			return nil, nil, err
		}
		orders = append(orders, *order)
	}
	return orders, data, nil
}

// CancelOrder cancels an order that has not started creating resources.
func (c *Client) CancelOrder(namespace, name string) (*types.CatalogItemOrder, error) {
	data, err := c.post(orderPath(namespace, name)+"/cancel", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	return parseOrder(data)
}

// WaitForOrder polls an order until it needs approval, is final, or the
// timeout passes, and returns the last state seen. A zero timeout returns the
// order as given.
func (c *Client) WaitForOrder(ctx context.Context, order *types.CatalogItemOrder, timeout, interval time.Duration) (*types.CatalogItemOrder, error) {
	if timeout <= 0 || orderSettled(order) {
		return order, nil
	}
	deadline := time.Now().Add(timeout)
	for {
		wait := interval
		if remaining := time.Until(deadline); remaining < wait {
			wait = remaining
		}
		if wait <= 0 {
			return order, nil
		}
		select {
		case <-ctx.Done():
			return order, ctx.Err()
		case <-time.After(wait):
		}
		latest, err := c.GetOrder(order.Namespace, order.Name)
		if err != nil {
			return order, err
		}
		order = latest
		if orderSettled(order) {
			return order, nil
		}
	}
}

// orderSettled reports whether waiting longer is pointless: the order is
// waiting for a person (approval) or will not change on its own.
func orderSettled(order *types.CatalogItemOrder) bool {
	return order.Phase == types.OrderPhasePendingApproval || order.Final()
}

func orderPath(namespace, name string) string {
	return fmt.Sprintf("%s/%s/%s", ordersPath, url.PathEscape(namespace), url.PathEscape(name))
}

func parseOrder(data []byte) (*types.CatalogItemOrder, error) {
	var order types.CatalogItemOrder
	if err := json.Unmarshal(data, &order); err != nil {
		return nil, fmt.Errorf("parsing order: %w", err)
	}
	order.Raw = append(json.RawMessage(nil), data...)
	return &order, nil
}
