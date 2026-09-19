package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/jobs"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/apierror"
)

// Events streams live job progress as server-sent events. Clients that cannot
// hold an SSE connection should poll GET /videos/:id instead (same payload).
func (s *Server) Events(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	v, err := s.store.Get(r.Context(), id)
	if err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	j, ok := s.registry.ByVideo(v.ID)
	if !ok {
		// No live job: emit the stored mirror once so the client still gets a
		// terminal/initial state, then close.
		writeSSE(w, s.videoDetail(r.Context(), v))
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		apierror.Write(w, apierror.CodeInternal, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	ch, unsub := j.Subscribe()
	defer unsub()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	emit := func(snap jobs.Snapshot) {
		writeSSE(w, map[string]any{"id": v.ID, "status": statusForSnapshot(snap), "job": snap})
		flusher.Flush()
	}
	emit(j.Snapshot())
	for {
		select {
		case <-r.Context().Done():
			return
		case snap := <-ch:
			emit(snap)
			if snap.Stage == jobs.StageDone || snap.Stage == jobs.StageFailed {
				return
			}
		case <-heartbeat.C:
			_, _ = w.Write([]byte(": heartbeat\n\n"))
			flusher.Flush()
		}
	}
}

func statusForSnapshot(snap jobs.Snapshot) string {
	switch snap.Stage {
	case jobs.StageDone:
		return "under_review"
	case jobs.StageFailed:
		return "failed"
	default:
		return "processing"
	}
}

func writeSSE(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	_, _ = w.Write([]byte("data: "))
	_, _ = w.Write(b)
	_, _ = w.Write([]byte("\n\n"))
}
