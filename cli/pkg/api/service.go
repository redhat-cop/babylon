package api

import (
	"encoding/json"
	"fmt"
	"net/url"
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

	runtimeDefault := resourceClaimDefaultRuntime(claim)

	now := time.Now().UTC()
	startTimestamp := formatTime(now)
	stopTimestamp := formatTime(now.Add(runtimeDefault))

	var patch map[string]interface{}
	if claim.Spec.Provider != nil {
		patch = map[string]interface{}{
			"spec": map[string]interface{}{
				"provider": map[string]interface{}{
					"parameterValues": map[string]interface{}{
						"start_timestamp": startTimestamp,
						"stop_timestamp":  stopTimestamp,
					},
				},
			},
		}
	} else {
		patch = patchLegacyResourceClaimActionSchedule(claim, "start", startTimestamp, stopTimestamp)
	}

	return c.PatchResourceClaim(namespace, name, patch)
}

func resourceClaimDefaultRuntime(claim *types.ResourceClaim) time.Duration {
	const fallback = 4 * time.Hour
	if claim.Status != nil && claim.Status.Summary != nil {
		if d, err := parseDuration(claim.Status.Summary.RuntimeDefault); err == nil {
			return d
		}
	}
	if claim.Spec.Provider != nil || len(claim.Spec.Resources) == 0 {
		return fallback
	}

	// Legacy resources share a stop time; use the shortest runtime, as the UI does.
	var shortest time.Duration
	for i, resource := range claim.Spec.Resources {
		configured := ""
		if claim.Status != nil {
			for _, status := range claim.Status.Resources {
				if status.Name == resource.Name && status.State != nil && status.State.Spec.Vars != nil && status.State.Spec.Vars.ActionSchedule != nil {
					configured = status.State.Spec.Vars.ActionSchedule.DefaultRuntime
					break
				}
			}
		}
		if configured == "" {
			var template types.AnarchySubject
			if err := json.Unmarshal(resource.Template, &template); err == nil && template.Spec.Vars != nil && template.Spec.Vars.ActionSchedule != nil {
				configured = template.Spec.Vars.ActionSchedule.DefaultRuntime
			}
		}
		runtime := fallback
		if d, err := parseDuration(configured); err == nil {
			runtime = d
		}
		if i == 0 || runtime < shortest {
			shortest = runtime
		}
	}
	return shortest
}

// StopResourceClaim stops a running resource claim.
func (c *Client) StopResourceClaim(namespace, name string) (*types.ResourceClaim, error) {
	claim, err := c.GetResourceClaim(namespace, name)
	if err != nil {
		return nil, err
	}

	stopTimestamp := formatTime(time.Now().UTC())

	var patch map[string]interface{}
	if claim.Spec.Provider != nil {
		patch = map[string]interface{}{
			"spec": map[string]interface{}{
				"provider": map[string]interface{}{
					"parameterValues": map[string]interface{}{
						"stop_timestamp": stopTimestamp,
					},
				},
			},
		}
	} else {
		patch = patchLegacyResourceClaimActionSchedule(claim, "stop", "", stopTimestamp)
	}

	return c.PatchResourceClaim(namespace, name, patch)
}

func patchLegacyResourceClaimActionSchedule(claim *types.ResourceClaim, action, startTimestamp, stopTimestamp string) map[string]interface{} {
	spec := structToMap(claim.Spec)
	resources, _ := spec["resources"].([]interface{})
	for _, resource := range resources {
		resourceMap, ok := resource.(map[string]interface{})
		if !ok {
			continue
		}
		name, ok := resourceMap["name"].(string)
		if !ok || !resourceSupportsAction(claim, name, action) {
			continue
		}
		template, ok := resourceMap["template"].(map[string]interface{})
		if !ok {
			continue
		}
		templateSpec, ok := template["spec"].(map[string]interface{})
		if !ok {
			continue
		}
		vars, ok := templateSpec["vars"].(map[string]interface{})
		if !ok {
			continue
		}
		actionSchedule, ok := vars["action_schedule"].(map[string]interface{})
		if !ok {
			continue
		}
		if startTimestamp != "" {
			actionSchedule["start"] = startTimestamp
		}
		actionSchedule["stop"] = stopTimestamp
	}
	return map[string]interface{}{"spec": spec}
}

func resourceSupportsAction(claim *types.ResourceClaim, name, action string) bool {
	if claim.Status == nil {
		return false
	}
	for _, resource := range claim.Status.Resources {
		if resource.Name != name || resource.State == nil || resource.State.Status == nil {
			continue
		}
		_, supported := resource.State.Status.SupportedActions[action]
		return supported
	}
	return false
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

// formatTime formats a time for the Babylon API.
func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
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
