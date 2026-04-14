package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// ListResourceClaims lists resource claims in a namespace.
func (c *Client) ListResourceClaims(namespace string, limit int, continueToken string) (*types.ResourceClaimList, error) {
	params := url.Values{}
	if limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", limit))
	}
	if continueToken != "" {
		params.Set("continue", continueToken)
	}

	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims", types.PoolboyDomain, namespace)
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var list types.ResourceClaimList
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("parsing resource claims: %w", err)
	}
	return &list, nil
}

// ListAllResourceClaims lists all resource claims in a namespace, auto-paginating.
func (c *Client) ListAllResourceClaims(namespace string) ([]types.ResourceClaim, error) {
	var allItems []types.ResourceClaim
	continueToken := ""
	for {
		list, err := c.ListResourceClaims(namespace, 100, continueToken)
		if err != nil {
			return nil, err
		}
		allItems = append(allItems, list.Items...)
		if list.Metadata.Continue == "" {
			break
		}
		continueToken = list.Metadata.Continue
	}
	return allItems, nil
}

// GetResourceClaim gets a single resource claim.
func (c *Client) GetResourceClaim(namespace, name string) (*types.ResourceClaim, error) {
	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims/%s", types.PoolboyDomain, namespace, name)
	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var claim types.ResourceClaim
	if err := json.Unmarshal(data, &claim); err != nil {
		return nil, fmt.Errorf("parsing resource claim: %w", err)
	}
	return &claim, nil
}

// CreateResourceClaim creates a new resource claim.
func (c *Client) CreateResourceClaim(claim *types.ResourceClaim) (*types.ResourceClaim, error) {
	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims", types.PoolboyDomain, claim.Metadata.Namespace)
	data, err := c.post(path, claim)
	if err != nil {
		return nil, err
	}

	var result types.ResourceClaim
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parsing created resource claim: %w", err)
	}
	return &result, nil
}

// PatchResourceClaim patches a resource claim with a merge patch.
func (c *Client) PatchResourceClaim(namespace, name string, patch interface{}) (*types.ResourceClaim, error) {
	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims/%s", types.PoolboyDomain, namespace, name)
	data, err := c.patch(path, patch)
	if err != nil {
		return nil, err
	}

	var result types.ResourceClaim
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parsing patched resource claim: %w", err)
	}
	return &result, nil
}

// DeleteResourceClaim deletes a resource claim.
func (c *Client) DeleteResourceClaim(namespace, name string) error {
	_, err := c.delete(fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims/%s", types.PoolboyDomain, namespace, name))
	return err
}

// StartResourceClaim starts a stopped resource claim.
func (c *Client) StartResourceClaim(namespace, name string) (*types.ResourceClaim, error) {
	// First get the current state to read runtime_default
	claim, err := c.GetResourceClaim(namespace, name)
	if err != nil {
		return nil, err
	}

	runtimeDefault := 4 * time.Hour // default 4h
	if claim.Status != nil && claim.Status.Summary != nil && claim.Status.Summary.RuntimeDefault != "" {
		if d, err := parseDuration(claim.Status.Summary.RuntimeDefault); err == nil {
			runtimeDefault = d
		}
	}

	now := time.Now().UTC()
	startTimestamp := formatTime(now)
	stopTimestamp := formatTime(now.Add(runtimeDefault))

	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"provider": map[string]interface{}{
				"parameterValues": map[string]interface{}{
					"start_timestamp": startTimestamp,
					"stop_timestamp":  stopTimestamp,
				},
			},
		},
	}

	return c.PatchResourceClaim(namespace, name, patch)
}

// StopResourceClaim stops a running resource claim.
func (c *Client) StopResourceClaim(namespace, name string) (*types.ResourceClaim, error) {
	stopTimestamp := formatTime(time.Now().UTC())

	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"provider": map[string]interface{}{
				"parameterValues": map[string]interface{}{
					"stop_timestamp": stopTimestamp,
				},
			},
		},
	}

	return c.PatchResourceClaim(namespace, name, patch)
}

// RetireResourceClaim retires a resource claim by setting lifespan end to now.
// Mirrors the UI's setLifespanEndForResourceClaim: sends the full spec with updated lifespan.end.
func (c *Client) RetireResourceClaim(namespace, name string) (*types.ResourceClaim, error) {
	// GET the current resource first (same as the UI does)
	claim, err := c.GetResourceClaim(namespace, name)
	if err != nil {
		return nil, err
	}

	endTimestamp := formatTime(time.Now().UTC())

	// Build patch with the full spec, updating lifespan.end
	specMap := structToMap(claim.Spec)
	if specMap["lifespan"] == nil {
		specMap["lifespan"] = map[string]interface{}{}
	}
	if lifespan, ok := specMap["lifespan"].(map[string]interface{}); ok {
		lifespan["end"] = endTimestamp
	}

	patch := map[string]interface{}{
		"spec": specMap,
	}

	return c.PatchResourceClaim(namespace, name, patch)
}

// structToMap converts a struct to a map via JSON round-trip.
func structToMap(v interface{}) map[string]interface{} {
	data, _ := json.Marshal(v)
	var m map[string]interface{}
	json.Unmarshal(data, &m)
	return m
}

// OrderService creates a new service from a catalog item.
// This mirrors the UI's createServiceRequest in api.ts.
func (c *Client) OrderService(catalogItem *types.CatalogItem, serviceNamespace string, params map[string]interface{}, endDate time.Time) (*types.ResourceClaim, error) {
	name := generateK8sName(catalogItem.Metadata.Name)

	// Determine catalog namespace display name
	catalogDisplayName := catalogItem.Metadata.Namespace
	for _, cns := range c.Session.CatalogNamespaces {
		if cns.Name == catalogItem.Metadata.Namespace {
			if cns.DisplayName != "" {
				catalogDisplayName = cns.DisplayName
			}
			break
		}
	}

	// Determine requester
	requester := c.Session.User
	for _, sns := range c.Session.ServiceNamespaces {
		if sns.Name == serviceNamespace && sns.Requester != "" {
			requester = sns.Requester
			break
		}
	}

	displayName := catalogItem.Spec.DisplayName
	if displayName == "" {
		displayName = catalogItem.Metadata.Name
	}

	annotations := map[string]string{
		types.BabylonDomain + "/catalogDisplayName":     catalogDisplayName,
		types.BabylonDomain + "/catalogItemDisplayName": displayName,
		types.DemoDomain + "/requester":                 requester,
		types.DemoDomain + "/orderedBy":                 c.Session.User,
		types.BabylonDomain + "/category":               catalogItem.Spec.Category,
		types.BabylonDomain + "/url":                    fmt.Sprintf("%s/services/%s/%s", c.BaseURL, serviceNamespace, name),
		types.DemoDomain + "/scheduled":                 "false",
		types.DemoDomain + "/provide_salesforce-id_later": "true",
	}

	// Copy userData from catalog item if present
	if catalogItem.Spec.UserData != nil {
		if data, err := json.Marshal(catalogItem.Spec.UserData); err == nil {
			annotations[types.BabylonDomain+"/userData"] = string(data)
		}
	}

	// Copy message templates if present
	if catalogItem.Spec.MessageTemplates != nil {
		if catalogItem.Spec.MessageTemplates.Info != nil {
			if data, err := json.Marshal(catalogItem.Spec.MessageTemplates.Info); err == nil {
				annotations[types.DemoDomain+"/info-message-template"] = string(data)
			}
		}
		if catalogItem.Spec.WorkshopUserMode != "none" && catalogItem.Spec.MessageTemplates.User != nil {
			if data, err := json.Marshal(catalogItem.Spec.MessageTemplates.User); err == nil {
				annotations[types.DemoDomain+"/user-message-template"] = string(data)
			}
		}
	}

	if catalogItem.Spec.WorkshopUiDisabled {
		annotations[types.DemoDomain+"/workshopUiDisabled"] = "true"
	}

	// Copy displayNameComponent annotations from catalog item
	for key, value := range catalogItem.Metadata.Annotations {
		if strings.HasPrefix(key, types.BabylonDomain+"/displayNameComponent") {
			annotations[key] = value
		}
	}

	labels := map[string]string{
		types.BabylonDomain + "/catalogItemName":      catalogItem.Metadata.Name,
		types.BabylonDomain + "/catalogItemNamespace": catalogItem.Metadata.Namespace,
		types.DemoDomain + "/white-glove":             "false",
	}

	// Copy asset-uuid label if present
	if uuid, ok := catalogItem.Metadata.Labels["gpte.redhat.com/asset-uuid"]; ok {
		labels["gpte.redhat.com/asset-uuid"] = uuid
	}

	// Copy bookbag label if present
	if catalogItem.Spec.Bookbag != nil {
		labels[types.BabylonDomain+"/labUserInterface"] = "bookbag"
	}

	claim := &types.ResourceClaim{
		APIVersion: types.PoolboyDomain + "/v1",
		Kind:       "ResourceClaim",
		Metadata: types.ObjectMeta{
			Name:        name,
			Namespace:   serviceNamespace,
			Labels:      labels,
			Annotations: annotations,
		},
		Spec: types.ResourceClaimSpec{
			Provider: &types.ResourceClaimProvider{
				Name:            catalogItem.Metadata.Name,
				ParameterValues: make(map[string]interface{}),
			},
			Lifespan: &types.ResourceClaimLifespan{
				End: formatTime(endDate),
			},
		},
	}

	// Set parameter values from catalog item defaults
	for _, param := range catalogItem.Spec.Parameters {
		var value interface{}
		if param.OpenAPIV3Schema != nil && param.OpenAPIV3Schema.Default != nil {
			value = param.OpenAPIV3Schema.Default
		} else if param.Value != "" {
			value = param.Value
		}
		if value != nil {
			claim.Spec.Provider.ParameterValues[param.Name] = value
		}
	}

	// Apply user-provided parameter overrides
	for k, v := range params {
		claim.Spec.Provider.ParameterValues[k] = v
	}

	// Ensure purpose is set
	if _, ok := claim.Spec.Provider.ParameterValues["purpose"]; !ok {
		claim.Spec.Provider.ParameterValues["purpose"] = "Development"
	}

	// Try to create, retry with new name on conflict
	for attempts := 0; attempts < 5; attempts++ {
		result, err := c.CreateResourceClaim(claim)
		if err != nil {
			if IsConflict(err) {
				newName := generateK8sName(catalogItem.Metadata.Name)
				claim.Metadata.Name = newName
				claim.Metadata.Annotations[types.BabylonDomain+"/url"] =
					fmt.Sprintf("%s/services/%s/%s", c.BaseURL, serviceNamespace, newName)
				continue
			}
			return nil, err
		}
		return result, nil
	}
	return nil, fmt.Errorf("failed to create service after multiple attempts due to name conflicts")
}

// formatTime formats a time for the Babylon API.
func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

// generateK8sName generates a K8s-compliant name with random suffix.
func generateK8sName(baseName string) string {
	sanitized := sanitizeForK8s(baseName)
	suffix := randomSuffix(5)
	maxBase := 63 - 6 // reserve for "-xxxxx"
	if len(sanitized) > maxBase {
		sanitized = sanitized[:maxBase]
	}
	return sanitized + "-" + suffix
}

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9.]+`)

func sanitizeForK8s(name string) string {
	s := strings.ToLower(name)
	s = nonAlphaNum.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

func randomSuffix(n int) string {
	const chars = "bcdfghjklmnpqrstvwxz2456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// parseDuration parses duration strings like "4h", "2d", "30m".
func parseDuration(s string) (time.Duration, error) {
	// Handle days specially since Go doesn't support "d"
	if strings.HasSuffix(s, "d") {
		s = strings.TrimSuffix(s, "d")
		var days float64
		if _, err := fmt.Sscanf(s, "%f", &days); err == nil {
			return time.Duration(days * 24 * float64(time.Hour)), nil
		}
	}
	return time.ParseDuration(s)
}

// DisplayName returns a human-readable name for a resource claim.
func DisplayName(rc *types.ResourceClaim) string {
	if rc.Metadata.Annotations != nil {
		if dn, ok := rc.Metadata.Annotations[types.BabylonDomain+"/catalogItemDisplayName"]; ok {
			return dn
		}
	}
	return rc.Metadata.Name
}
