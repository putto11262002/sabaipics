package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/observability"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/server"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting SabaiPics FTP Server...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}
	log.Printf("Configuration loaded successfully")

	obsShutdown, err := observability.Init(context.Background(), cfg)
	if err != nil {
		log.Fatalf("Failed to initialize observability: %v", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := obsShutdown(shutdownCtx); err != nil {
			log.Printf("Failed to shutdown observability cleanly: %v", err)
		}
	}()
	log.Println("Observability initialized (OTLP traces + metrics)")

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
			os.Exit(1)
		}
	}

	log.Println("FTP server shut down successfully")
}
