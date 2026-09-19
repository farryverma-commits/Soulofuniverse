package store

import (
	"context"
	"net/http"
	"net/url"
)

// Profile is the role/status subset of a profiles row used for authz.
type Profile struct {
	ID     string `json:"id"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// GetProfile fetches role and status for one user id.
func (c *Client) GetProfile(ctx context.Context, userID string) (*Profile, error) {
	q := url.Values{
		"id":     {"eq." + userID},
		"select": {"id,role,status"},
	}
	req, err := c.req(ctx, http.MethodGet, "profiles", q, nil)
	if err != nil {
		return nil, err
	}
	singleObject(req)
	var p Profile
	if err := c.do(req, http.StatusOK, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
