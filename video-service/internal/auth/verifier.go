// Package auth resolves a Supabase user JWT to a caller identity and
// enforces the admin-only gate for the video service.
package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/store"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

// Caller is an authenticated, authorized admin.
type Caller struct {
	UserID string
}

// Verifier checks JWTs against the Supabase Auth API and profiles.
type Verifier struct {
	authURL string
	store   *store.Client
}

func New(supabaseURL string, s *store.Client) *Verifier {
	return &Verifier{authURL: supabaseURL + "/auth/v1", store: s}
}

type authUser struct {
	ID string `json:"id"`
}

// Verify resolves the bearer token to a user via the Auth API, then requires
// profiles.role == admin and profiles.status == approved.
func (v *Verifier) Verify(ctx context.Context, token string) (*Caller, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.authURL+"/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", v.store.Apikey())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth api unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errInvalidToken
	}
	var u authUser
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil || u.ID == "" {
		return nil, errInvalidToken
	}
	p, err := v.store.GetProfile(ctx, u.ID)
	if err != nil {
		return nil, errInvalidToken
	}
	if p.Role != "admin" || p.Status != "approved" {
		return nil, errForbidden
	}
	return &Caller{UserID: u.ID}, nil
}

var (
	errInvalidToken = fmt.Errorf("invalid or expired token")
	errForbidden    = fmt.Errorf("admin access required")
)

// IsInvalidToken reports a 401-class failure (vs 403 forbidden).
func IsInvalidToken(err error) bool { return err == errInvalidToken }
