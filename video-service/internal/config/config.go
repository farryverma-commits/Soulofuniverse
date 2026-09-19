// Package config loads service configuration from the environment with
// fail-fast validation, mirroring video-engine's startup contract.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds every tunable the service needs.
type Config struct {
	BaseDir    string
	StagingDir string
	OutputDir  string
	LogDir     string
	ErrorDir   string

	SupabaseURL string
	SupabaseKey string
	BaseURL     string

	MaxWorkers     int
	Port           string
	MaxUploadBytes int64
	FFmpegPath     string
	FFprobePath    string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load reads the environment, validates required values and ensures the
// working directories exist. It returns an error instead of raising so the
// caller decides how to report startup failure.
func Load() (*Config, error) {
	base := getenv("BASE_DIR", "/videos")
	cfg := &Config{
		BaseDir:     base,
		StagingDir:  getenv("STAGING_DIR", filepath.Join(base, "staging")),
		OutputDir:   getenv("OUTPUT_DIR", filepath.Join(base, "hls")),
		LogDir:      getenv("LOG_DIR", filepath.Join(base, "logs")),
		ErrorDir:    getenv("ERROR_DIR", filepath.Join(base, "errors")),
		SupabaseURL: strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabaseKey: os.Getenv("SUPABASE_KEY"),
		BaseURL:     strings.TrimRight(os.Getenv("BASE_URL"), "/"),
		Port:        getenv("PORT", "8080"),
		FFmpegPath:  getenv("FFMPEG_PATH", "ffmpeg"),
		FFprobePath: getenv("FFPROBE_PATH", "ffprobe"),
	}
	workers, err := strconv.Atoi(getenv("MAX_WORKERS", "3"))
	if err != nil || workers < 1 {
		return nil, fmt.Errorf("invalid MAX_WORKERS: must be a positive integer")
	}
	cfg.MaxWorkers = workers
	maxMB, err := strconv.ParseInt(getenv("MAX_UPLOAD_MB", "2048"), 10, 64)
	if err != nil || maxMB < 1 {
		return nil, fmt.Errorf("invalid MAX_UPLOAD_MB: must be a positive integer")
	}
	cfg.MaxUploadBytes = maxMB << 20
	if cfg.SupabaseURL == "" || cfg.SupabaseKey == "" {
		return nil, fmt.Errorf("missing Supabase credentials (SUPABASE_URL/SUPABASE_KEY)")
	}
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("missing BASE_URL")
	}
	for _, d := range []string{cfg.StagingDir, cfg.OutputDir, cfg.LogDir, cfg.ErrorDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return nil, fmt.Errorf("create dir %s: %w", d, err)
		}
	}
	return cfg, nil
}
