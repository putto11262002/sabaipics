package server

import (
	"context"
	"log"

	"github.com/fclairamb/ftpserverlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/driver"
)

// Server wraps the FTP server and manages its lifecycle
type Server struct {
	ftpServer *ftpserver.FtpServer
	config    *config.Config
	db        *pgxpool.Pool
}

// New creates a new FTP server instance
func New(cfg *config.Config, db *pgxpool.Pool) (*Server, error) {
	// Create MainDriver with DB connection
	mainDriver := driver.NewMainDriver(db, cfg)

	// Create FTP server
	ftpServer := ftpserver.NewFtpServer(mainDriver)

	server := &Server{
		ftpServer: ftpServer,
		config:    cfg,
		db:        db,
	}

	log.Printf("[Server] FTP server created successfully")
	return server, nil
}

// Start starts the FTP server and blocks until it stops
func (s *Server) Start() error {
	log.Printf("[Server] Starting FTP server on %s", s.config.FTPListenAddress)
	log.Printf("[Server] Passive port range: %d-%d", s.config.FTPPassivePortStart, s.config.FTPPassivePortEnd)

	// ListenAndServe blocks until the server is stopped
	if err := s.ftpServer.ListenAndServe(); err != nil {
		log.Printf("[Server] FTP server stopped with error: %v", err)
		return err
	}

	log.Printf("[Server] FTP server stopped gracefully")
	return nil
}

// Shutdown performs graceful shutdown of the FTP server
// STUB: For now, just returns nil. Full implementation in later phase.
func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("[Server] STUB: Graceful shutdown requested")

	// STUB: In production, we would:
	// 1. Stop accepting new connections
	// 2. Wait for active transfers to complete (with timeout)
	// 3. Close database connections
	// 4. Flush Sentry events

	// For now, just log
	log.Printf("[Server] STUB: Shutdown complete")
	return nil
}
