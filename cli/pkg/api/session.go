package api

import (
	"encoding/json"
	"fmt"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// GetSession fetches the current session from the API.
func (c *Client) GetSession() (*types.Session, error) {
	data, err := c.get("/auth/session")
	if err != nil {
		return nil, fmt.Errorf("fetching session: %w", err)
	}
	return c.parseSessionFromData(data)
}

func (c *Client) parseSessionFromData(data []byte) (*types.Session, error) {
	var session types.Session
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("parsing session: %w", err)
	}
	c.Session = &session
	c.Token = session.Token
	return &session, nil
}

// EnsureSession ensures a valid session exists, fetching one if needed.
func (c *Client) EnsureSession() error {
	if c.Session != nil {
		return nil
	}
	_, err := c.GetSession()
	return err
}

// UserNamespace returns the user's default service namespace.
func (c *Client) UserNamespace() string {
	if c.Session != nil {
		return c.Session.UserNamespace.Name
	}
	return ""
}

// CatalogNamespaces returns the list of catalog namespace names.
func (c *Client) CatalogNamespaces() []string {
	if c.Session == nil {
		return nil
	}
	names := make([]string, len(c.Session.CatalogNamespaces))
	for i, ns := range c.Session.CatalogNamespaces {
		names[i] = ns.Name
	}
	return names
}
