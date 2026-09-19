// Command server runs the Soul of Universe video service: admin-only HTTP
// upload, ffmpeg HLS transcoding workers, live progress streaming, and
// Supabase status sync.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/auth"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/config"
	vhttp "github.com/farryverma-commits/Soulofuniverse/video-service/internal/http"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/jobs"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/service"
	"github.com/farryverma-commits/Soulofuniverse/video-service/internal/store"

	"gopkg.in/natefinch/lumberjack.v2"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "video-service: "+err.Error())
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := newLogger(cfg)
	storeClient := store.New(cfg.SupabaseURL, cfg.SupabaseKey)
	registry := jobs.NewRegistry()
	pipe := service.New(cfg, storeClient, registry, log)
	pool := jobs.NewPool(cfg.MaxWorkers, func(ctx context.Context, j *jobs.Job) {
		pipe.Run(ctx, j)
	})
	srv := vhttp.NewServer(cfg, storeClient, registry, pool.Submit, pipe, log)
	verifier := auth.New(cfg.SupabaseURL, storeClient)

	recoverCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	requeued, err := pipe.RecoverOrphans(recoverCtx, pool.Submit, 100)
	cancel()
	if err != nil {
		log.Warn("startup recovery failed", "error", err)
	} else if requeued > 0 {
		log.Info("startup recovery requeued jobs", "count", requeued)
	}

	httpSrv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           vhttp.Router(srv, verifier),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	errCh := make(chan error, 1)
	go func() {
		log.Info("video-service listening", "port", cfg.Port, "workers", cfg.MaxWorkers)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()
	select {
	case <-ctx.Done():
		log.Info("shutdown signal received")
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	}
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	_ = httpSrv.Shutdown(shutCtx)
	// Drain the queue first so accepted uploads are not lost, then let
	// in-flight ffmpeg processes (bound to the pool context) finish or die
	// with the process. CommandContext kills ffmpeg on cancel.
	pool.Shutdown()
	log.Info("video-service stopped")
	return nil
}

func newLogger(cfg *config.Config) *slog.Logger {
	file := &lumberjack.Logger{
		Filename:   cfg.LogDir + "/service.log",
		MaxSize:    20,
		MaxBackups: 7,
		MaxAge:     7,
		Compress:   true,
	}
	multi := &multiWriter{writers: []interface{ Write([]byte) (int, error) }{os.Stdout, file}}
	return slog.New(slog.NewJSONHandler(multi, nil))
}

type multiWriter struct {
	writers []interface{ Write([]byte) (int, error) }
}

func (m *multiWriter) Write(p []byte) (int, error) {
	for _, w := range m.writers {
		if _, err := w.Write(p); err != nil {
			return 0, err
		}
	}
	return len(p), nil
}
