package api

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/url"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// ListAllWorkshops lists workshops in a namespace with auto-pagination.
func (c *Client) ListAllWorkshops(namespace string) ([]types.Workshop, error) {
	var allItems []types.Workshop
	continueToken := ""
	for {
		list, err := c.listWorkshops(namespace, 100, continueToken)
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

func (c *Client) listWorkshops(namespace string, limit int, continueToken string) (*types.WorkshopList, error) {
	params := url.Values{}
	if limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", limit))
	}
	if continueToken != "" {
		params.Set("continue", continueToken)
	}

	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/workshops", types.BabylonDomain, namespace)
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var list types.WorkshopList
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("parsing workshops: %w", err)
	}
	return &list, nil
}

// DeleteWorkshop deletes a workshop by name.
func (c *Client) DeleteWorkshop(namespace, name string) error {
	_, err := c.delete(fmt.Sprintf("/apis/%s/v1/namespaces/%s/workshops/%s", types.BabylonDomain, namespace, name))
	return err
}

// GetWorkshop gets a single workshop by name.
func (c *Client) GetWorkshop(namespace, name string) (*types.Workshop, error) {
	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/workshops/%s", types.BabylonDomain, namespace, name)
	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var ws types.Workshop
	if err := json.Unmarshal(data, &ws); err != nil {
		return nil, fmt.Errorf("parsing workshop: %w", err)
	}
	return &ws, nil
}

// WorkshopDisplayName returns the display name for a workshop.
func WorkshopDisplayName(ws *types.Workshop) string {
	if ws.Spec.DisplayName != "" {
		return ws.Spec.DisplayName
	}
	if ws.Metadata.Annotations != nil {
		if dn, ok := ws.Metadata.Annotations[types.BabylonDomain+"/catalogItemDisplayName"]; ok {
			return dn
		}
	}
	return ws.Metadata.Name
}

// ListWorkshopServices lists ResourceClaims associated with a workshop via label selector.
func (c *Client) ListWorkshopServices(namespace, workshopName string) ([]types.ResourceClaim, error) {
	var allItems []types.ResourceClaim
	continueToken := ""
	for {
		params := url.Values{}
		params.Set("labelSelector", types.BabylonDomain+"/workshop="+workshopName)
		params.Set("limit", "100")
		if continueToken != "" {
			params.Set("continue", continueToken)
		}

		path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/resourceclaims?%s",
			types.PoolboyDomain, namespace, params.Encode())
		data, err := c.get(path)
		if err != nil {
			return nil, err
		}

		var list types.ResourceClaimList
		if err := json.Unmarshal(data, &list); err != nil {
			return nil, fmt.Errorf("parsing workshop services: %w", err)
		}
		allItems = append(allItems, list.Items...)
		if list.Metadata.Continue == "" {
			break
		}
		continueToken = list.Metadata.Continue
	}
	return allItems, nil
}

// GetAnarchySubject fetches the full AnarchySubject directly from the K8s API.
// The ResourceClaim status includes a trimmed AnarchySubject (no towerJobs),
// so this call is needed to get provisioning timestamps.
func (c *Client) GetAnarchySubject(namespace, name string) (*types.AnarchySubject, error) {
	path := fmt.Sprintf("/apis/anarchy.gpte.redhat.com/v1/namespaces/%s/anarchysubjects/%s", namespace, name)
	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var subject types.AnarchySubject
	if err := json.Unmarshal(data, &subject); err != nil {
		return nil, fmt.Errorf("parsing anarchy subject: %w", err)
	}
	return &subject, nil
}

// GeneratePassword generates a random password of the given length.
func GeneratePassword(n int) (string, error) {
	const chars = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, n)
	max := big.NewInt(int64(len(chars)))
	for i := range b {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("generate secure random password character: %w", err)
		}
		b[i] = chars[idx.Int64()]
	}
	return string(b), nil
}
