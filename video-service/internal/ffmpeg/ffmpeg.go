// Package ffmpeg wraps the ffmpeg/ffprobe binaries: thumbnail extraction,
// two-variant HLS transcode (port of video-engine's command), and machine
// -progress parsing that drives live percentage updates.
package ffmpeg

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ProgressFunc receives transcoding progress updates (0-100 within the
// transcoding stage) while ffmpeg runs.
type ProgressFunc func(percent int)

// Runner invokes ffmpeg/ffprobe with job-scoped logging.
type Runner struct {
	FFmpeg  string
	FFprobe string
	// Log is appended with command lines and stderr output.
	Log io.Writer
	// LogMu guards Log when progress parsing and stderr copy run concurrently.
	LogMu *sync.Mutex
}

func (r *Runner) logf(format string, args ...any) {
	if r.Log == nil {
		return
	}
	if r.LogMu != nil {
		r.LogMu.Lock()
		defer r.LogMu.Unlock()
	}
	fmt.Fprintf(r.Log, time.Now().UTC().Format(time.RFC3339)+" "+format+"\n", args...)
}

func threads() string {
	n := runtime.NumCPU() / 2
	if n < 1 {
		n = 1
	}
	return strconv.Itoa(n)
}

// Duration probes the source file length in seconds via ffprobe.
func (r *Runner) Duration(ctx context.Context, input string) (float64, error) {
	cmd := exec.CommandContext(ctx, r.FFprobe,
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "json", input)
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("ffprobe: %w", err)
	}
	var v struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(out, &v); err != nil {
		return 0, fmt.Errorf("ffprobe parse: %w", err)
	}
	d, err := strconv.ParseFloat(strings.TrimSpace(v.Format.Duration), 64)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("ffprobe: no usable duration")
	}
	return d, nil
}

// Thumbnail extracts a single JPEG at the 5s mark, like the Python engine.
func (r *Runner) Thumbnail(ctx context.Context, input, dest string) error {
	args := []string{"-y", "-ss", "00:00:05", "-i", input,
		"-vframes", "1", "-q:v", "2", dest}
	r.logf("run: ffmpeg %s", strings.Join(args, " "))
	cmd := exec.CommandContext(ctx, r.FFmpeg, args...)
	cmd.Stderr = &lockedWriter{w: r.Log, mu: r.LogMu}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("thumbnail: %w", err)
	}
	return nil
}

// Transcode runs the two-variant HLS command (360p + 720p, GOP-aligned,
// VOD playlists with variant subfolders) and reports progress derived from
// ffmpeg's -progress machine output against durationSecs.
func (r *Runner) Transcode(ctx context.Context, input, videoFolder string, durationSecs float64, onProgress ProgressFunc) error {
	if err := os.MkdirAll(filepath.Join(videoFolder, "stream_0"), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(videoFolder, "stream_1"), 0o755); err != nil {
		return err
	}
	args := []string{"-y",
		"-i", input,
		"-threads", threads(),
		"-filter_complex", "[0:v]split=2[v1][v2];[v1]scale=640:360[v1out];[v2]scale=1280:720[v2out]",
		"-map", "[v1out]", "-map", "0:a?",
		"-map", "[v2out]", "-map", "0:a?",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
		"-c:a", "aac", "-b:a", "128k",
		"-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
		"-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(videoFolder, "stream_%v", "data%03d.ts"),
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", "v:0,a:0 v:1,a:1",
		"-progress", "pipe:1", "-nostats",
		filepath.Join(videoFolder, "stream_%v", "manifest.m3u8"),
	}
	r.logf("run: ffmpeg %s", strings.Join(args, " "))
	cmd := exec.CommandContext(ctx, r.FFmpeg, args...)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("transcode pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("transcode pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("transcode start: %w", err)
	}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(&lockedWriter{w: r.Log, mu: r.LogMu}, stderr)
	}()
	ParseProgress(bufio.NewScanner(stdout), durationSecs, onProgress)
	wg.Wait()
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("transcode: %w", err)
	}
	return nil
}

type lockedWriter struct {
	w  io.Writer
	mu *sync.Mutex
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	if l.w == nil {
		return len(p), nil
	}
	if l.mu != nil {
		l.mu.Lock()
		defer l.mu.Unlock()
	}
	return l.w.Write(p)
}
