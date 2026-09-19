package config

import (
	"os"
	"path/filepath"
	"testing"
)

func validEnv(t *testing.T, base string) {
	t.Helper()
	t.Setenv("BASE_DIR", base)
	t.Setenv("SUPABASE_URL", "http://localhost:8000")
	t.Setenv("SUPABASE_KEY", "service-role-key")
	t.Setenv("BASE_URL", "https://media.example.com")
}

func TestLoadDefaults(t *testing.T) {
	base := filepath.Join(t.TempDir(), "videos")
	validEnv(t, base)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() = %v", err)
	}
	if cfg.StagingDir != filepath.Join(base, "staging") {
		t.Errorf("StagingDir = %q", cfg.StagingDir)
	}
	if cfg.OutputDir != filepath.Join(base, "hls") {
		t.Errorf("OutputDir = %q", cfg.OutputDir)
	}
	if cfg.MaxWorkers != 3 || cfg.Port != "8080" || cfg.MaxUploadBytes != 2048<<20 {
		t.Errorf("defaults wrong: %+v", cfg)
	}
	for _, d := range []string{cfg.StagingDir, cfg.OutputDir, cfg.LogDir, cfg.ErrorDir} {
		if st, err := os.Stat(d); err != nil || !st.IsDir() {
			t.Errorf("dir %s not created: %v", d, err)
		}
	}
}

func TestLoadMissingCredentials(t *testing.T) {
	base := t.TempDir()
	t.Setenv("BASE_DIR", base)
	t.Setenv("BASE_URL", "https://media.example.com")
	os.Unsetenv("SUPABASE_URL")
	os.Unsetenv("SUPABASE_KEY")
	if _, err := Load(); err == nil {
		t.Error("Load() with missing credentials should fail")
	}
}
