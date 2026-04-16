package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/url"
	"time"

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

// CreateWorkshop creates a Workshop and a WorkshopProvision for the given catalog item.
// Returns the created Workshop.
func (c *Client) CreateWorkshop(
	catalogItem *types.CatalogItem,
	serviceNamespace string,
	seats int,
	displayName string,
	accessPassword string,
	openRegistration bool,
	endDate time.Time,
	params map[string]interface{},
) (*types.Workshop, error) {
	name := generateK8sName(catalogItem.Metadata.Name)

	// Resolve requester
	requester := c.Session.User
	for _, sns := range c.Session.ServiceNamespaces {
		if sns.Name == serviceNamespace && sns.Requester != "" {
			requester = sns.Requester
			break
		}
	}

	if displayName == "" {
		displayName = catalogItem.Spec.DisplayName
		if displayName == "" {
			displayName = catalogItem.Metadata.Name
		}
	}

	annotations := map[string]string{
		types.BabylonDomain + "/category":  catalogItem.Spec.Category,
		types.BabylonDomain + "/url":       fmt.Sprintf("%s/workshops/%s/%s", c.BaseURL, serviceNamespace, name),
		types.DemoDomain + "/requester":    requester,
		types.DemoDomain + "/orderedBy":    c.Session.User,
		types.DemoDomain + "/scheduled":    "false",
	}

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

	labels := map[string]string{
		types.BabylonDomain + "/catalogItemName":      catalogItem.Metadata.Name,
		types.BabylonDomain + "/catalogItemNamespace": catalogItem.Metadata.Namespace,
		types.DemoDomain + "/white-glove":             "false",
	}
	if uuid, ok := catalogItem.Metadata.Labels["gpte.redhat.com/asset-uuid"]; ok {
		labels["gpte.redhat.com/asset-uuid"] = uuid
	}

	workshop := &types.Workshop{
		APIVersion: types.BabylonDomain + "/v1",
		Kind:       "Workshop",
		Metadata: types.ObjectMeta{
			Name:        name,
			Namespace:   serviceNamespace,
			Labels:      labels,
			Annotations: annotations,
		},
		Spec: types.WorkshopSpec{
			DisplayName:       displayName,
			AccessPassword:    accessPassword,
			MultiuserServices: catalogItem.Spec.WorkshopUserMode != "none",
			OpenRegistration:  openRegistration,
			Lifespan: &types.WorkshopLifespan{
				End: formatTime(endDate),
			},
		},
	}

	// Create workshop with retry on 409
	var createdWorkshop *types.Workshop
	for attempts := 0; attempts < 5; attempts++ {
		data, err := c.post(
			fmt.Sprintf("/apis/%s/v1/namespaces/%s/workshops", types.BabylonDomain, serviceNamespace),
			workshop,
		)
		if err != nil {
			if IsConflict(err) {
				newName := generateK8sName(catalogItem.Metadata.Name)
				workshop.Metadata.Name = newName
				workshop.Metadata.Annotations[types.BabylonDomain+"/url"] =
					fmt.Sprintf("%s/workshops/%s/%s", c.BaseURL, serviceNamespace, newName)
				continue
			}
			return nil, err
		}
		var ws types.Workshop
		if err := json.Unmarshal(data, &ws); err != nil {
			return nil, fmt.Errorf("parsing created workshop: %w", err)
		}
		createdWorkshop = &ws
		break
	}
	if createdWorkshop == nil {
		return nil, fmt.Errorf("failed to create workshop after multiple attempts due to name conflicts")
	}

	// Build parameter values from catalog defaults + overrides
	parameterValues := make(map[string]interface{})
	for _, param := range catalogItem.Spec.Parameters {
		var value interface{}
		if param.OpenAPIV3Schema != nil && param.OpenAPIV3Schema.Default != nil {
			value = param.OpenAPIV3Schema.Default
		} else if param.Value != "" {
			value = param.Value
		}
		if value != nil {
			parameterValues[param.Name] = value
		}
	}
	for k, v := range params {
		parameterValues[k] = v
	}
	if _, ok := parameterValues["purpose"]; !ok {
		parameterValues["purpose"] = "Development"
	}

	// Create WorkshopProvision
	isController := true
	provision := &types.WorkshopProvision{
		APIVersion: types.BabylonDomain + "/v1",
		Kind:       "WorkshopProvision",
		Metadata: types.ObjectMeta{
			Name:      createdWorkshop.Metadata.Name,
			Namespace: serviceNamespace,
			Labels: map[string]string{
				types.BabylonDomain + "/catalogItemName":      catalogItem.Metadata.Name,
				types.BabylonDomain + "/catalogItemNamespace": catalogItem.Metadata.Namespace,
			},
			Annotations: map[string]string{
				types.BabylonDomain + "/category": catalogItem.Spec.Category,
			},
			OwnerReferences: []types.OwnerReference{
				{
					APIVersion: types.BabylonDomain + "/v1",
					Kind:       "Workshop",
					Name:       createdWorkshop.Metadata.Name,
					UID:        createdWorkshop.Metadata.UID,
					Controller: &isController,
				},
			},
		},
		Spec: types.WorkshopProvisionSpec{
			WorkshopName: createdWorkshop.Metadata.Name,
			CatalogItem: types.WorkshopProvisionCatalog{
				Name:      catalogItem.Metadata.Name,
				Namespace: catalogItem.Metadata.Namespace,
			},
			Count:       seats,
			Concurrency: seats,
			StartDelay:  10,
			Parameters:  parameterValues,
		},
	}

	if uuid, ok := catalogItem.Metadata.Labels["gpte.redhat.com/asset-uuid"]; ok {
		provision.Metadata.Labels["gpte.redhat.com/asset-uuid"] = uuid
	}

	_, err := c.post(
		fmt.Sprintf("/apis/%s/v1/namespaces/%s/workshopprovisions", types.BabylonDomain, serviceNamespace),
		provision,
	)
	if err != nil {
		return nil, fmt.Errorf("workshop %q created but provision failed (clean up with 'babylon workshop delete %s'): %w",
			createdWorkshop.Metadata.Name, createdWorkshop.Metadata.Name, err)
	}

	return createdWorkshop, nil
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

// GeneratePassword generates a random password of the given length.
func GeneratePassword(n int) string {
	const chars = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
