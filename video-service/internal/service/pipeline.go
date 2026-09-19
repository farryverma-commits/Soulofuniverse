// Package service implements the transcode pipeline: thumbnail, HLS,
// Supabase status transitions, and failure handling. It is the Go port of
// video-engine's handle_video_pipeline with the watchdog/input-folder path
// replaced by explicit job submissions from the HTTP upload endpoint.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/config"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/ffmpeg"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/jobs"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/store"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/apierror"
	"github.com/farryverma-commits/Soulofuniverse/video-service/pkg/slug"
)

// deps bundles the pipeline's collaborators for testability.
type deps struct {
	cfg      *config.Config
	store    *store.Client
	registry *jobs.Registry
	log      *slog.Logger
	// now lets tests observe mirrored timestamps; nil means time.Now().UTC.
	now func() string
}

func (d *deps) timestamp() string {
	if d.now != nil {
		return d.now()
	}
	return time.Now().UTC().Format(time.RFC3339)
}

// Pipeline runs transcode jobs submitted by the HTTP layer.
type Pipeline struct {
	d *deps
}

// New creates a Pipeline sharing config, store and registry with the server.
func New(cfg *config.Config, s *store.Client, r *jobs.Registry, log *slog.Logger) *Pipeline {
	return &Pipeline{d: &deps{cfg: cfg, store: s, registry: r, log: log}}
}

// mirrorJob persists the live job payload into videos.metadata.job, throttled
// by the caller to at most one write per second during transcoding.
func (p *Pipeline) mirrorJob(ctx context.Context, j *jobs.Job) {
	snap := j.Snapshot()
	var jerr *store.JobErr
	if snap.Error != nil {
		jerr = &store.JobErr{Code: snap.Error.Code, Message: snap.Error.Message, ErrorID: snap.Error.ErrorID}
	}
	meta := &store.JobMeta{Stage: snap.Stage, Progress: snap.Progress, UpdatedAt: snap.UpdatedAt.Format(time.RFC3339), Error: jerr}
	if err := p.d.store.SetStatus(ctx, snap.VideoID, videoStatusFor(snap.Stage), meta, jobURLs(p.d.cfg, snap.VideoID)); err != nil {
		p.d.log.Warn("mirror job state failed", "job_id", snap.ID, "video_id", snap.VideoID, "error", err)
	}
}

func videoStatusFor(stage string) string {
	switch stage {
	case jobs.StageDone:
		return store.StatusUnderReview
	case jobs.StageFailed:
		return store.StatusFailed
	default:
		return store.StatusProcessing
	}
}

// jobURLs builds the public HLS/thumbnail URLs for a video id.
func jobURLs(cfg *config.Config, videoID string) map[string]any {
	base := cfg.BaseURL + "/" + videoID
	return map[string]any{
		"master_url": base + "/master.m3u8",
		"thumb_url":  base + "/thumb.jpg",
	}
}

// Run executes one job to a terminal state. It never returns an error: every
// failure mode ends in StageFailed with a typed error surfaced to the job,
// the DB mirror, the per-job log and slog.
func (p *Pipeline) Run(ctx context.Context, j *jobs.Job) {
	snap := j.Snapshot()
	videoID, videoFolder := snap.VideoID, filepath.Join(p.d.cfg.OutputDir, snap.VideoID)
	stagingPath := j.StagedPath
	if stagingPath == "" {
		stagingPath = stagedPathFor(p.d.cfg, snap.VideoID)
	}
	logPath := filepath.Join(p.d.cfg.LogDir, videoID+".log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		p.d.log.Error("open job log failed", "job_id", snap.ID, "error", err)
	}
	if logFile != nil {
		defer logFile.Close()
	}
	var logMu sync.Mutex
	runner := &ffmpeg.Runner{FFmpeg: p.d.cfg.FFmpegPath, FFprobe: p.d.cfg.FFprobePath, Log: logFile, LogMu: &logMu}

	fail := func(code apierror.Code, message, errorID string) {
		j.Fail(string(code), message, errorID)
		func() {
			mctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			p.mirrorJob(mctx, j)
		}()
		p.moveToErrorDir(stagingPath, j.Filename)
		p.d.log.Error("job failed", "job_id", snap.ID, "video_id", videoID,
			"code", string(code), "error_id", errorID, "message", message)
	}

	if err := os.MkdirAll(videoFolder, 0o755); err != nil {
		e := apierror.New(apierror.CodeInternal, "prepare output directory failed")
		fail(e.Code, e.Message+": "+err.Error(), e.ErrorID)
		return
	}

	j.Update(jobs.StageThumbnail, 2)
	p.mirrorJob(ctx, j)
	thumbDest := filepath.Join(videoFolder, "thumb.jpg")
	if err := runner.Thumbnail(ctx, stagingPath, thumbDest); err != nil {
		if ctx.Err() != nil {
			e := apierror.New(apierror.CodeInternal, "transcode cancelled on shutdown")
			fail(e.Code, e.Message, e.ErrorID)
			return
		}
		e := apierror.New(apierror.CodeTranscodeFailed, "thumbnail extraction failed")
		fail(e.Code, e.Message+": "+err.Error(), e.ErrorID)
		return
	}

	duration, err := runner.Duration(ctx, stagingPath)
	if err != nil {
		p.d.log.Warn("ffprobe failed, progress will be indeterminate", "job_id", snap.ID, "error", err)
		duration = 0
	}

	j.Update(jobs.StageTranscoding, 5)
	p.mirrorJob(ctx, j)
	lastMirror := time.Now()
	throttledMirror := func() {
		if time.Since(lastMirror) >= time.Second {
			lastMirror = time.Now()
			p.mirrorJob(ctx, j)
		}
	}
	transcodeErr := runner.Transcode(ctx, stagingPath, videoFolder, duration, func(pct int) {
		j.Update(jobs.StageTranscoding, 5+pct*90/100)
		throttledMirror()
	})
	if transcodeErr != nil {
		if ctx.Err() != nil {
			e := apierror.New(apierror.CodeInternal, "transcode cancelled on shutdown")
			fail(e.Code, e.Message, e.ErrorID)
			return
		}
		e := apierror.New(apierror.CodeTranscodeFailed, "HLS transcode failed")
		fail(e.Code, e.Message+": "+transcodeErr.Error(), e.ErrorID)
		return
	}

	j.Update(jobs.StageFinalizing, 97)
	p.mirrorJob(ctx, j)
	if err := os.Remove(stagingPath); err != nil && !os.IsNotExist(err) {
		p.d.log.Warn("staging cleanup failed", "job_id", snap.ID, "error", err)
	}

	mctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := p.d.store.SetStatus(mctx, videoID, store.StatusUnderReview,
		&store.JobMeta{Stage: jobs.StageDone, Progress: 100, UpdatedAt: p.d.timestamp()},
		jobURLsWithTitle(p.d.cfg, videoID, j.Filename)); err != nil {
		e := apierror.New(apierror.CodeDependencyUnavailable, "publish final status failed")
		fail(e.Code, e.Message+": "+err.Error(), e.ErrorID)
		return
	}
	j.Complete()
	p.d.log.Info("job complete", "job_id", snap.ID, "video_id", videoID)
}

func jobURLsWithTitle(cfg *config.Config, videoID, filename string) map[string]any {
	m := jobURLs(cfg, videoID)
	m["title"] = slug.DisplayTitle(filename)
	return m
}

// moveToErrorDir quarantines the failed staging file; a name collision gets a
// uuid suffix instead of losing the file.
func (p *Pipeline) moveToErrorDir(stagingPath, filename string) {
	if _, err := os.Stat(stagingPath); err != nil {
		return
	}
	dest := filepath.Join(p.d.cfg.ErrorDir, filename)
	if _, err := os.Stat(dest); err == nil {
		ext := filepath.Ext(filename)
		dest = filepath.Join(p.d.cfg.ErrorDir,
			filename[:len(filename)-len(ext)]+"-"+uuid.NewString()[:8]+ext)
	}
	if err := os.Rename(stagingPath, dest); err != nil {
		p.d.log.Error("quarantine to error dir failed", "src", stagingPath, "error", err)
	}
}

// RecoverOrphans reaps rows left in processing by a previous crash: jobs whose
// staging file still exists are re-enqueued (bounded by limit), the rest are
// marked failed with a startup_recovery note. Returns requeued count.
func (p *Pipeline) RecoverOrphans(ctx context.Context, enqueue func(j *jobs.Job) bool, limit int) (int, error) {
	rows, err := p.d.store.ListByStatus(ctx, store.StatusProcessing, limit)
	if err != nil {
		return 0, fmt.Errorf("list orphaned processing rows: %w", err)
	}
	requeued := 0
	for _, v := range rows {
		staged := stagedPathFor(p.d.cfg, v.ID)
		_, statErr := os.Stat(staged)
		if statErr == nil {
			j := p.d.registry.Create(v.ID, v.Slug, stagedOriginalName(v), staged)
			if enqueue(j) {
				requeued++
				continue
			}
		}
		note := "startup_recovery: previous run exited mid-transcode"
		if statErr != nil {
			note += "; staging file missing"
		}
		_ = p.d.store.SetStatus(ctx, v.ID, store.StatusFailed,
			&store.JobMeta{Stage: jobs.StageFailed, Progress: 0, UpdatedAt: p.d.timestamp(),
				Error: &store.JobErr{Code: string(apierror.CodeInternal), Message: note, ErrorID: uuid.NewString()[:8]}}, nil)
	}
	return requeued, nil
}

func stagedPathFor(cfg *config.Config, videoID string) string {
	for _, ext := range []string{".mp4", ".mov", ".mkv", ".avi"} {
		if p := filepath.Join(cfg.StagingDir, videoID+ext); fileExists(p) {
			return p
		}
	}
	return filepath.Join(cfg.StagingDir, videoID+".mp4")
}

// StagedPath finds the staged source file for a video id, trying the known
// upload extensions in order.
func StagedPath(stagingDir, videoID string) string {
	for _, ext := range []string{".mp4", ".mov", ".mkv", ".avi"} {
		if p := filepath.Join(stagingDir, videoID+ext); fileExists(p) {
			return p
		}
	}
	return filepath.Join(stagingDir, videoID+".mp4")
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func stagedOriginalName(v store.Video) string {
	if v.Title != "" {
		return v.Title
	}
	return v.Slug
}
