package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/auth"
)

// Router builds the chi router with middleware and all routes.
func Router(s *Server, v *auth.Verifier) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)
	r.Use(SecurityHeaders)

	r.Get("/healthz", s.Healthz)
	r.Get("/readyz", s.Readyz)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(RequireAdmin(v))
		r.Post("/videos/upload", s.Upload)
		r.Get("/videos", s.List)
		r.Get("/videos/{id}", s.Get)
		r.Get("/videos/{id}/events", s.Events)
		r.Get("/videos/{id}/logs", s.Logs)
		r.Post("/videos/{id}/process", s.Process)
		r.Patch("/videos/{id}/publish", s.Publish)
		r.Patch("/videos/{id}/unpublish", s.Unpublish)
		r.Delete("/videos/{id}", s.Delete)
	})
	return r
}
