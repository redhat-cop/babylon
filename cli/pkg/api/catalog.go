package api

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// ListCatalogItems lists catalog items in a namespace.
func (c *Client) ListCatalogItems(namespace string, limit int, continueToken string) (*types.CatalogItemList, error) {
	params := url.Values{}
	if limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", limit))
	}
	if continueToken != "" {
		params.Set("continue", continueToken)
	}

	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/catalogitems", types.BabylonDomain, namespace)
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var list types.CatalogItemList
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("parsing catalog items: %w", err)
	}
	return &list, nil
}

// ListAllCatalogItems lists catalog items across all catalog namespaces, auto-paginating.
func (c *Client) ListAllCatalogItems(namespaces []string) ([]types.CatalogItem, error) {
	var allItems []types.CatalogItem
	for _, ns := range namespaces {
		continueToken := ""
		for {
			list, err := c.ListCatalogItems(ns, 100, continueToken)
			if err != nil {
				return nil, fmt.Errorf("listing catalog items in %s: %w", ns, err)
			}
			allItems = append(allItems, list.Items...)
			if list.Metadata.Continue == "" {
				break
			}
			continueToken = list.Metadata.Continue
		}
	}
	return allItems, nil
}

// GetCatalogItem gets a single catalog item by namespace and name.
func (c *Client) GetCatalogItem(namespace, name string) (*types.CatalogItem, error) {
	path := fmt.Sprintf("/apis/%s/v1/namespaces/%s/catalogitems/%s", types.BabylonDomain, namespace, name)
	data, err := c.get(path)
	if err != nil {
		return nil, err
	}

	var item types.CatalogItem
	if err := json.Unmarshal(data, &item); err != nil {
		return nil, fmt.Errorf("parsing catalog item: %w", err)
	}
	return &item, nil
}

// FindCatalogItem searches for a catalog item by name across all catalog namespaces.
func (c *Client) FindCatalogItem(name string) (*types.CatalogItem, error) {
	for _, ns := range c.CatalogNamespaces() {
		item, err := c.GetCatalogItem(ns, name)
		if err != nil {
			if IsNotFound(err) || IsForbidden(err) {
				continue
			}
			return nil, err
		}
		return item, nil
	}
	return nil, fmt.Errorf("catalog item %q not found in any catalog namespace", name)
}
