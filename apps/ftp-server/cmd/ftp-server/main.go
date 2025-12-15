package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/server"
)

// getSampleRateForEnvironment returns the appropriate Sentry trace sampling rate
// based on the environment to balance observability with cost and performance.
//
// Sampling Rate Guide:
// - Development: 100% (1.0) - Capture all traces for debugging
// - Staging: 50% (0.5) - Good balance for testing
// - Production: 10% (0.1) - Recommended for high-traffic production
//
// For production, you can adjust based on traffic:
//   - Low traffic (<1000 req/day): 0.5 (50%)
//   - Medium traffic (1K-10K req/day): 0.2 (20%)
//   - High traffic (10K-100K req/day): 0.1 (10%)
//   - Very high traffic (>100K req/day): 0.05 (5%) or 0.01 (1%)
func getSampleRateForEnvironment(env string) float64 {
	switch env {
	case "development", "dev":
		return 1.0 // 100% - capture everything for debugging
	case "staging", "stage":
		return 0.5 // 50% - good balance for pre-production testing
	case "production", "prod":
		return 0.1 // 10% - recommended for production (adjust based on your traffic)
	default:
		return 1.0 // Default to 100% for unknown environments
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting SabaiPics FTP Server...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}
	log.Printf("Configuration loaded successfully")

	// Initialize Sentry SDK
	if cfg.SentryDSN != "" {
		// Determine sampling rate based on environment
		sampleRate := getSampleRateForEnvironment(cfg.SentryEnvironment)

		err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      cfg.SentryEnvironment,
			EnableTracing:    true,
			TracesSampleRate: sampleRate,
			Debug:            cfg.SentryEnvironment == "development",
			EnableLogs:       true,
			BeforeSendLog: func(log *sentry.Log) *sentry.Log {
				// Filter logs based on environment to control costs
				if cfg.SentryEnvironment == "production" || cfg.SentryEnvironment == "prod" {
					// Only send warn, error, and fatal to Sentry in production
					if log.Level == sentry.LogLevelTrace ||
						log.Level == sentry.LogLevelDebug ||
						log.Level == sentry.LogLevelInfo {
						return nil // Still printed locally if Debug=true, but not sent to Sentry
					}
				}
				// In development/staging, send everything
				return log
			},
		})
		if err != nil {
			log.Fatalf("Failed to initialize Sentry: %v", err)
		}
		defer sentry.Flush(2 * time.Second)
		log.Printf("Sentry initialized: environment=%s, sample_rate=%.0f%%", cfg.SentryEnvironment, sampleRate*100)
	} else {
		log.Println("Sentry DSN not configured - telemetry disabled")
	}

	// Create and start client manager for centralized client management
	mgr := clientmgr.NewManager()
	mgr.Start()
	log.Printf("Client manager started")

	// Create FTP server
	ftpServer, err := server.New(cfg, mgr)
	if err != nil {
		log.Fatalf("Failed to create FTP server: %v", err)
	}

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	errChan := make(chan error, 1)
	go func() {
		errChan <- ftpServer.Start()
	}()

	// Wait for either a shutdown signal or server error
	select {
	case sig := <-sigChan:
		log.Printf("Received signal: %v - initiating graceful shutdown", sig)

		// Create shutdown context with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Attempt graceful shutdown
		if err := ftpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("Error during shutdown: %v", err)
		}

	case err := <-errChan:
		if err != nil {
			log.Printf("Server error: %v", err)
			sentry.CaptureException(err)
			os.Exit(1)
		}
	}

	log.Println("FTP server shut down successfully")
}
