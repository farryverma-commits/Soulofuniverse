package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/apierror"
)

func TestBearer(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Bearer abc123", "abc123"},
		{"bearer abc123", "abc123"},
		{"", ""},
		{"Token abc", ""},
		{"Bearer", ""},
	}
	for _, c := range cases {
		if got := bearer(c.in); got != c.want {
			t.Errorf("bearer(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestRequireAdminRejectsMissingToken(t *testing.T) {
	next := RequireAdmin(nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/videos", nil)
	rec := httptest.NewRecorder()
	// nil verifier would panic on Verify, but the middleware must reject the
	// missing token before ever touching it.
	next.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestApierrorStatusMapping(t *testing.T) {
	if apierror.New(apierror.CodeConflictActiveJob, "x").Status() != 409 {
		t.Error("conflict should map to 409")
	}
	if apierror.New(apierror.CodeTranscodeFailed, "x").Status() != 422 {
		t.Error("transcode_failed should map to 422")
	}
}
