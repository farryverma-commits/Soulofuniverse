package http

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/config"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/jobs"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/service"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/store"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/apierror"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/slug"
)

// Server wires config, store, registry, pool and pipeline into handlers.
type Server struct {
	cfg      *config.Config
	store    *store.Client
	registry *jobs.Registry
	submit   func(*jobs.Job) bool
	pipe     *service.Pipeline
	log      *slog.Logger
}

// NewServer creates the handler bundle. submit enqueues jobs onto the pool.
func NewServer(cfg *config.Config, s *store.Client, r *jobs.Registry, submit func(*jobs.Job) bool, pipe *service.Pipeline, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: s, registry: r, submit: submit, pipe: pipe, log: log}
}

var validExts = map[string]bool{".mp4": true, ".mov": true, ".mkv": true, ".avi": true}

// uploadResponse is the 202 body for a new job.
type uploadResponse struct {
	ID     string        `json:"id"`
	Slug   string        `json:"slug"`
	Status string        `json:"status"`
	Job    jobs.Snapshot `json:"job"`
}

// Upload streams a multipart file to staging, creates the processing row and
// enqueues the transcode job.
func (s *Server) Upload(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > s.cfg.MaxUploadBytes {
		apierror.Write(w, apierror.CodeValidationFailed,
			"upload exceeds limit of "+strconv.FormatInt(s.cfg.MaxUploadBytes>>20, 10)+"MB")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes+1<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		apierror.Write(w, apierror.CodeValidationFailed, "invalid multipart upload: "+err.Error())
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		apierror.Write(w, apierror.CodeValidationFailed, "missing 'file' part")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if !validExts[ext] {
		apierror.Write(w, apierror.CodeValidationFailed, "unsupported extension: want .mp4/.mov/.mkv/.avi")
		return
	}
	videoID := uuid.NewString()
	videoSlug := slug.Generate(hdr.Filename)
	if videoSlug == "" {
		videoSlug = "video-" + videoID[:8]
	}
	stagingPath := filepath.Join(s.cfg.StagingDir, videoID+ext)
	dst, err := os.OpenFile(stagingPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		e := apierror.New(apierror.CodeInternal, "stage upload failed")
		s.log.Error("stage upload failed", "error_id", e.ErrorID, "error", err)
		e.Write(w)
		return
	}
	written, err := io.Copy(dst, f)
	_ = dst.Close()
	if err != nil {
		_ = os.Remove(stagingPath)
		apierror.Write(w, apierror.CodeValidationFailed, "upload interrupted: "+err.Error())
		return
	}
	if written == 0 {
		_ = os.Remove(stagingPath)
		apierror.Write(w, apierror.CodeValidationFailed, "empty file")
		return
	}

	row, err := s.store.UpsertProcessing(r.Context(), store.Video{
		ID:        videoID,
		Title:     slug.DisplayTitle(hdr.Filename),
		Slug:      videoSlug,
		MasterURL: s.cfg.BaseURL + "/" + videoID + "/master.m3u8",
		ThumbURL:  s.cfg.BaseURL + "/" + videoID + "/thumb.jpg",
		Status:    store.StatusProcessing,
		Metadata:  map[string]any{"job": map[string]any{"stage": jobs.StageQueued, "progress": 0}},
	})
	if err != nil {
		_ = os.Remove(stagingPath)
		e := apierror.New(apierror.CodeDependencyUnavailable, "create video record failed")
		s.log.Error("upsert processing failed", "error_id", e.ErrorID, "video_id", videoID, "error", err)
		e.WithJob(videoID).Write(w)
		return
	}
	job := s.registry.Create(row.ID, row.Slug, hdr.Filename, stagingPath)
	if !s.submit(job) {
		_ = os.Remove(stagingPath)
		_ = s.store.SetStatus(r.Context(), row.ID, store.StatusFailed, nil, nil)
		apierror.Write(w, apierror.CodeDependencyUnavailable, "transcode queue full, try again")
		return
	}
	s.log.Info("upload accepted", "video_id", row.ID, "slug", row.Slug, "bytes", written)
	writeJSON(w, http.StatusAccepted, uploadResponse{ID: row.ID, Slug: row.Slug, Status: store.StatusProcessing, Job: job.Snapshot()})
}

// videoDetail merges the DB row with the live in-memory job, the registry
// winning when present (it is fresher than the throttled metadata mirror).
func (s *Server) videoDetail(ctx context.Context, v *store.Video) map[string]any {
	out := map[string]any{
		"id": v.ID, "title": v.Title, "slug": v.Slug,
		"master_url": v.MasterURL, "thumb_url": v.ThumbURL,
		"status": v.Status, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt,
	}
	var job any
	if j, ok := s.registry.ByVideo(v.ID); ok {
		job = j.Snapshot()
	} else if v.Metadata != nil {
		job = v.Metadata["job"]
	}
	out["job"] = job
	return out
}

// Get fetches one video with live job state.
func (s *Server) Get(w http.ResponseWriter, r *http.Request) {
	v, err := s.store.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	writeJSON(w, http.StatusOK, s.videoDetail(r.Context(), v))
}

// List returns newest-first rows with optional status filter.
func (s *Server) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	if status != "" {
		switch status {
		case store.StatusProcessing, store.StatusUnderReview, store.StatusPublished, store.StatusFailed:
		default:
			apierror.Write(w, apierror.CodeValidationFailed, "invalid status filter")
			return
		}
	}
	limit := 50
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	rows, err := s.store.List(r.Context(), status, limit)
	if err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "list videos failed")
		s.log.Error("list failed", "error_id", e.ErrorID, "error", err)
		e.Write(w)
		return
	}
	out := make([]any, 0, len(rows))
	for i := range rows {
		out = append(out, s.videoDetail(r.Context(), &rows[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"videos": out})
}

// Process re-enqueues a failed (or stalled processing) job.
func (s *Server) Process(w http.ResponseWriter, r *http.Request) {
	v, err := s.store.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	if v.Status != store.StatusFailed && v.Status != store.StatusProcessing {
		apierror.Write(w, apierror.CodeConflictState,
			"only failed or processing videos can be reprocessed (status="+v.Status+")")
		return
	}
	if j, ok := s.registry.ByVideo(v.ID); ok && !j.Terminal() {
		apierror.Write(w, apierror.CodeConflictActiveJob, "job already active for this video")
		return
	}
	staged := service.StagedPath(s.cfg.StagingDir, v.ID)
	if _, err := os.Stat(staged); err != nil {
		apierror.Write(w, apierror.CodeConflictState, "source file no longer staged; re-upload required")
		return
	}
	if err := s.store.SetStatus(r.Context(), v.ID, store.StatusProcessing,
		&store.JobMeta{Stage: jobs.StageQueued, Progress: 0, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}, nil); err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "reset status failed")
		s.log.Error("process reset failed", "error_id", e.ErrorID, "video_id", v.ID, "error", err)
		e.Write(w)
		return
	}
	name := v.Title
	if name == "" {
		name = v.Slug
	}
	job := s.registry.Create(v.ID, v.Slug, name, staged)
	if !s.submit(job) {
		apierror.Write(w, apierror.CodeDependencyUnavailable, "transcode queue full, try again")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"id": v.ID, "status": store.StatusProcessing, "job": job.Snapshot()})
}

// Publish moves under_review to published.
func (s *Server) Publish(w http.ResponseWriter, r *http.Request) {
	s.transition(w, r, store.StatusUnderReview, store.StatusPublished)
}

// Unpublish moves published back to under_review.
func (s *Server) Unpublish(w http.ResponseWriter, r *http.Request) {
	s.transition(w, r, store.StatusPublished, store.StatusUnderReview)
}

func (s *Server) transition(w http.ResponseWriter, r *http.Request, from, to string) {
	v, err := s.store.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	if v.Status != from {
		apierror.Write(w, apierror.CodeConflictState,
			"expected status "+from+", found "+v.Status)
		return
	}
	if err := s.store.SetStatus(r.Context(), v.ID, to, nil, nil); err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "status transition failed")
		s.log.Error("transition failed", "error_id", e.ErrorID, "video_id", v.ID, "error", err)
		e.Write(w)
		return
	}
	v.Status = to
	writeJSON(w, http.StatusOK, s.videoDetail(r.Context(), v))
}

// Delete removes the HLS output directory and the DB row.
func (s *Server) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := s.store.Get(r.Context(), id); err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	if j, ok := s.registry.ByVideo(id); ok && !j.Terminal() {
		apierror.Write(w, apierror.CodeConflictActiveJob, "cannot delete while a job is active")
		return
	}
	if err := os.RemoveAll(filepath.Join(s.cfg.OutputDir, id)); err != nil {
		e := apierror.New(apierror.CodeInternal, "remove HLS output failed")
		s.log.Error("delete output failed", "error_id", e.ErrorID, "video_id", id, "error", err)
		e.Write(w)
		return
	}
	if err := s.store.Delete(r.Context(), id); err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "delete video record failed")
		s.log.Error("delete row failed", "error_id", e.ErrorID, "video_id", id, "error", err)
		e.Write(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Logs returns the tail of the per-job log file.
func (s *Server) Logs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := s.store.Get(r.Context(), id); err != nil {
		apierror.Write(w, apierror.CodeNotFound, "video not found")
		return
	}
	tail := 200
	if v, err := strconv.Atoi(r.URL.Query().Get("tail")); err == nil && v > 0 && v <= 2000 {
		tail = v
	}
	lines, err := tailFile(filepath.Join(s.cfg.LogDir, id+".log"), tail)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "lines": []string{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "lines": lines})
}

func tailFile(path string, n int) ([]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines, nil
}

// Healthz is unauthenticated liveness.
func (s *Server) Healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// Readyz checks ffmpeg and PostgREST reachability.
func (s *Server) Readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "database unreachable")
		s.log.Error("readyz db failed", "error_id", e.ErrorID, "error", err)
		e.Write(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
}
