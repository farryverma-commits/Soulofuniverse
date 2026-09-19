// Package http is the admin-only JSON API for the video lifecycle.
package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/auth"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/apierror"
)

type ctxKey string

const callerKey ctxKey = "caller"

// CallerFrom returns the authenticated admin for this request.
func CallerFrom(ctx context.Context) *auth.Caller {
	c, _ := ctx.Value(callerKey).(*auth.Caller)
	return c
}

// RequireAdmin resolves the Supabase JWT and enforces role=admin,
// status=approved. Missing/invalid tokens get 401, non-admins get 403.
func RequireAdmin(v *auth.Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearer(r.Header.Get("Authorization"))
			if token == "" {
				apierror.Write(w, apierror.CodeUnauthorized, "missing bearer token")
				return
			}
			caller, err := v.Verify(r.Context(), token)
			if err != nil {
				if auth.IsInvalidToken(err) {
					apierror.Write(w, apierror.CodeUnauthorized, "invalid or expired token")
				} else {
					apierror.Write(w, apierror.CodeForbidden, "admin access required")
				}
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), callerKey, caller)))
		})
	}
}

func bearer(h string) string {
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
