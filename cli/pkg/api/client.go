package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redhat-gpte/babylon/cli/pkg/types"
)

// Client is the Babylon API client.
type Client struct {
	BaseURL    string
	Token      string            // Babylon session token (Authentication header)
	Cookies    map[string]string // OAuth proxy cookies
	Debug      bool
	HTTPClient *http.Client
	Session    *types.Session
}

// NewClient creates a new API client.
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SetInsecureSkipVerify disables TLS certificate verification.
func (c *Client) SetInsecureSkipVerify(skip bool) {
	transport := c.getTransport()
	transport.TLSClientConfig = &tls.Config{
		InsecureSkipVerify: skip,
	}
}

func (c *Client) getTransport() *http.Transport {
	if t, ok := c.HTTPClient.Transport.(*http.Transport); ok {
		return t
	}
	t := &http.Transport{}
	c.HTTPClient.Transport = t
	return t
}

func (c *Client) debugf(format string, args ...interface{}) {
	if c.Debug {
		fmt.Fprintf(os.Stderr, "[debug] "+format+"\n", args...)
	}
}

func maskToken(token string) string {
	if len(token) <= 10 {
		return "***"
	}
	return token[:6] + "..." + token[len(token)-4:]
}

// APIError represents an error from the API.
type APIError struct {
	StatusCode int
	Status     string
	Message    string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("API error %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("API error %d: %s", e.StatusCode, e.Status)
}

// IsNotFound returns true for 404 errors.
func IsNotFound(err error) bool {
	if apiErr, ok := err.(*APIError); ok {
		return apiErr.StatusCode == 404
	}
	return false
}

// IsConflict returns true for 409 errors.
func IsConflict(err error) bool {
	if apiErr, ok := err.(*APIError); ok {
		return apiErr.StatusCode == 409
	}
	return false
}

func (c *Client) doRequest(method, path string, body interface{}, contentType string) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshaling request body: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	fullURL := c.BaseURL + path
	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	// OAuth proxy cookies (gets past the proxy)
	for name, value := range c.Cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}

	// Babylon session token (identifies user to the catalog API)
	if c.Token != "" {
		req.Header.Set("Authentication", "Bearer "+c.Token)
	}

	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	} else if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	c.debugf("%s %s", method, fullURL)
	if c.Token != "" {
		c.debugf("Authentication: Bearer %s", maskToken(c.Token))
	}
	for name := range c.Cookies {
		c.debugf("Cookie: %s=<set>", name)
	}

	// Track redirects
	var redirectChain []string
	c.HTTPClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		redirectChain = append(redirectChain, fmt.Sprintf("%s %s", req.Method, req.URL.String()))
		if len(via) >= 10 {
			return fmt.Errorf("too many redirects")
		}
		return nil
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cannot reach Babylon API at %s: %w", c.BaseURL, err)
	}
	defer resp.Body.Close()

	c.debugf("Response: %d %s", resp.StatusCode, resp.Status)
	if len(redirectChain) > 0 {
		c.debugf("Redirect chain:")
		for i, r := range redirectChain {
			c.debugf("  %d. %s", i+1, r)
		}
	}
	for _, name := range []string{"Content-Type", "Location", "Set-Cookie", "Www-Authenticate"} {
		if v := resp.Header.Get(name); v != "" {
			c.debugf("  %s: %s", name, v)
		}
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if c.Debug {
		preview := string(respBody)
		if len(preview) > 500 {
			preview = preview[:500] + "...[truncated]"
		}
		c.debugf("Body (%d bytes): %s", len(respBody), preview)
	}

	// Detect HTML responses (OAuth proxy redirect to login page)
	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "text/html") || (len(respBody) > 0 && respBody[0] == '<') {
		hint := "the OAuth proxy may have rejected the token"
		if len(redirectChain) > 0 {
			hint = fmt.Sprintf("followed %d redirect(s) and landed on a login page", len(redirectChain))
		}
		return nil, &APIError{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Message:    fmt.Sprintf("server returned HTML instead of JSON (%s)", hint),
		}
	}

	if resp.StatusCode >= 400 {
		msg := ""
		var status struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(respBody, &status) == nil {
			msg = status.Message
		}
		return nil, &APIError{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Message:    msg,
		}
	}

	return respBody, nil
}

func (c *Client) get(path string) ([]byte, error) {
	return c.doRequest(http.MethodGet, path, nil, "")
}

func (c *Client) post(path string, body interface{}) ([]byte, error) {
	return c.doRequest(http.MethodPost, path, body, "application/json")
}

func (c *Client) patch(path string, body interface{}) ([]byte, error) {
	return c.doRequest(http.MethodPatch, path, body, "application/merge-patch+json")
}

func (c *Client) delete(path string) ([]byte, error) {
	return c.doRequest(http.MethodDelete, path, nil, "")
}
