package http

import (
	"net/http"
	"strings"
)

// SecurityHeaders sets baseline hardening headers on every API response.
// HSTS is only emitted when the request arrived over HTTPS, either directly
// (TLS) or via a TLS-terminating proxy (X-Forwarded-Proto: https), so local
// plain-HTTP health checks never advertise HSTS.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if httpsRequest(r) {
			h.Set("Strict-Transport-Security", "max-age=86400; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func httpsRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
