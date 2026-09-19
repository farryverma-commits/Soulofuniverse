// Package store is the Supabase PostgREST data layer, called with the
// service_role key. Status transitions mirror videos_status_check and the
// review-to-publish lifecycle in frontend/DBSchema.md.
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

// Status values for the videos.status column.
const (
	StatusProcessing  = "processing"
	StatusUnderReview = "under_review"
	StatusPublished   = "published"
	StatusFailed      = "failed"
)

// Video is the subset of the videos row this service reads and writes.
type Video struct {
	ID        string         `json:"id"`
	Title     string         `json:"title"`
	Slug      string         `json:"slug"`
	MasterURL string         `json:"master_url"`
	ThumbURL  string         `json:"thumb_url"`
	Status    string         `json:"status"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	CreatedAt string         `json:"created_at,omitempty"`
	UpdatedAt string         `json:"updated_at,omitempty"`
}

// JobMeta is the live-progress payload mirrored into videos.metadata.job.
type JobMeta struct {
	Stage     string  `json:"stage"`
	Progress  int     `json:"progress"`
	UpdatedAt string  `json:"updated_at"`
	Error     *JobErr `json:"error,omitempty"`
}

// JobErr carries a terminal failure inside the job payload.
type JobErr struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	ErrorID string `json:"error_id"`
}

// Client talks to PostgREST with the service_role key.
type Client struct {
	baseURL string
	key     string
}

func New(baseURL, key string) *Client {
	return &Client{baseURL: baseURL, key: key}
}

// Apikey exposes the service_role key for sibling packages (auth verifier).
func (c *Client) Apikey() string { return c.key }

func (c *Client) req(ctx context.Context, method, path string, query url.Values, body any) (*http.Request, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(b)
	}
	u := c.baseURL + "/rest/v1/" + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func (c *Client) do(req *http.Request, want int, out any) error {
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("postgrest request: %w", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read postgrest response: %w", err)
	}
	if resp.StatusCode != want {
		return fmt.Errorf("postgrest %s: status %d: %s", req.URL.Path, resp.StatusCode, truncate(b, 500))
	}
	if out != nil && len(b) > 0 {
		if err := json.Unmarshal(b, out); err != nil {
			return fmt.Errorf("decode postgrest response: %w", err)
		}
	}
	return nil
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		return string(b[:n]) + "..."
	}
	return string(b)
}

func preferResolution(r *http.Request) {
	r.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")
}

func singleObject(r *http.Request) {
	r.Header.Set("Accept", "application/vnd.pgrst.object+json")
}

// UpsertProcessing creates the early processing row keyed on slug,
// exactly like video-engine's update_supabase_status(..., "processing").
func (c *Client) UpsertProcessing(ctx context.Context, v Video) (*Video, error) {
	q := url.Values{"on_conflict": {"slug"}}
	req, err := c.req(ctx, http.MethodPost, "videos", q, v)
	if err != nil {
		return nil, err
	}
	preferResolution(req)
	var out []Video
	if err := c.do(req, http.StatusCreated, &out); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("postgrest upsert returned no rows")
	}
	return &out[0], nil
}

// SetStatus updates status plus the job metadata mirror for one row.
func (c *Client) SetStatus(ctx context.Context, id, status string, job *JobMeta, extra map[string]any) error {
	patch := map[string]any{"status": status}
	if extra != nil {
		for k, v := range extra {
			patch[k] = v
		}
	}
	if job != nil {
		patch["metadata"] = map[string]any{"job": job}
	}
	q := url.Values{"id": {"eq." + id}}
	req, err := c.req(ctx, http.MethodPatch, "videos", q, patch)
	if err != nil {
		return err
	}
	return c.do(req, http.StatusNoContent, nil)
}

// Get fetches one video row by id.
func (c *Client) Get(ctx context.Context, id string) (*Video, error) {
	q := url.Values{
		"id":     {"eq." + id},
		"select": {"*"},
	}
	req, err := c.req(ctx, http.MethodGet, "videos", q, nil)
	if err != nil {
		return nil, err
	}
	singleObject(req)
	var v Video
	if err := c.do(req, http.StatusOK, &v); err != nil {
		return nil, err
	}
	return &v, nil
}

// List returns rows newest-first with optional status filter and limit.
func (c *Client) List(ctx context.Context, status string, limit int) ([]Video, error) {
	q := url.Values{
		"select": {"id,title,slug,master_url,thumb_url,status,metadata,created_at,updated_at"},
		"order":  {"created_at.desc"},
		"limit":  {fmt.Sprint(limit)},
	}
	if status != "" {
		q.Set("status", "eq."+status)
	}
	req, err := c.req(ctx, http.MethodGet, "videos", q, nil)
	if err != nil {
		return nil, err
	}
	var out []Video
	if err := c.do(req, http.StatusOK, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ListByStatus is the startup-recovery scan for orphaned processing rows.
func (c *Client) ListByStatus(ctx context.Context, status string, limit int) ([]Video, error) {
	return c.List(ctx, status, limit)
}

// Delete removes one video row by id.
func (c *Client) Delete(ctx context.Context, id string) error {
	q := url.Values{"id": {"eq." + id}}
	req, err := c.req(ctx, http.MethodDelete, "videos", q, nil)
	if err != nil {
		return err
	}
	return c.do(req, http.StatusNoContent, nil)
}

// Ping checks PostgREST reachability for readyz.
func (c *Client) Ping(ctx context.Context) error {
	q := url.Values{"select": {"id"}, "limit": {"1"}}
	req, err := c.req(ctx, http.MethodHead, "videos", q, nil)
	if err != nil {
		return err
	}
	return c.do(req, http.StatusOK, nil)
}
