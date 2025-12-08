package server

import (
	"context"
	"log"
	"log/slog"
	"os"

	"github.com/fclairamb/ftpserverlib"
	ftpslog "github.com/fclairamb/go-log/slog"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/driver"
)

// Server wraps the FTP server(s) and manages their lifecycle
type Server struct {
	explicitServer *ftpserver.FtpServer // Explicit FTPS server (port 2121, AUTH TLS)
	implicitServer *ftpserver.FtpServer // Implicit FTPS server (port 990, immediate TLS)
	config         *config.Config
	db             *pgxpool.Pool
}

// New creates FTP server instance(s) - explicit FTPS and optionally implicit FTPS
func New(cfg *config.Config, db *pgxpool.Pool) (*Server, error) {
	// Create explicit FTPS server (port 2121, AUTH TLS command)
	explicitDriver := driver.NewMainDriver(db, cfg)
	explicitServer := ftpserver.NewFtpServer(explicitDriver)

	// Configure FTP protocol debug logging if enabled
	if cfg.FTPDebug {
		// Create slog logger with debug level
		slogLogger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
		ftpLogger := ftpslog.NewWrap(slogLogger)
		explicitServer.Logger = ftpLogger

		log.Printf("[Server] FTP protocol debug logging ENABLED (all FTP commands/responses will be logged)")
	} else {
		log.Printf("[Server] FTP protocol debug logging DISABLED (set FTP_DEBUG=true to enable)")
	}

	server := &Server{
		explicitServer: explicitServer,
		config:         cfg,
		db:             db,
	}

	// Create implicit FTPS server if enabled (port 990, immediate TLS)
	if cfg.ImplicitFTPSEnabled {
		implicitDriver := driver.NewMainDriverImplicit(db, cfg)
		server.implicitServer = ftpserver.NewFtpServer(implicitDriver)

		// Share the same logger if debug is enabled
		if cfg.FTPDebug {
			slogLogger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
				Level: slog.LevelDebug,
			}))
			server.implicitServer.Logger = ftpslog.NewWrap(slogLogger)
		}

		log.Printf("[Server] Implicit FTPS server ENABLED on %s (immediate TLS)", cfg.ImplicitFTPSPort)
	} else {
		log.Printf("[Server] Implicit FTPS server DISABLED (set IMPLICIT_FTPS_ENABLED=true to enable)")
	}

	log.Printf("[Server] FTP server(s) created successfully")
	return server, nil
}

// Start starts the FTP server(s) and blocks until they stop
func (s *Server) Start() error {
	log.Printf("[Server] Starting explicit FTPS server on %s", s.config.FTPListenAddress)
	log.Printf("[Server] Passive port range: %d-%d", s.config.FTPPassivePortStart, s.config.FTPPassivePortEnd)

	// Start implicit FTPS server in background if enabled
	if s.implicitServer != nil {
		log.Printf("[Server] Starting implicit FTPS server on %s", s.config.ImplicitFTPSPort)

		// Channel to capture errors from implicit server
		implicitErrChan := make(chan error, 1)

		go func() {
			if err := s.implicitServer.ListenAndServe(); err != nil {
				log.Printf("[Server] Implicit FTPS server stopped with error: %v", err)
				implicitErrChan <- err
			} else {
				log.Printf("[Server] Implicit FTPS server stopped gracefully")
				implicitErrChan <- nil
			}
		}()

		// If implicit server fails to start, we'll catch it here
		go func() {
			if err := <-implicitErrChan; err != nil {
				log.Printf("[Server] ERROR: Implicit FTPS server failed: %v", err)
			}
		}()
	}

	// Start explicit FTPS server (blocks until stopped)
	if err := s.explicitServer.ListenAndServe(); err != nil {
		log.Printf("[Server] Explicit FTPS server stopped with error: %v", err)
		return err
	}

	log.Printf("[Server] Explicit FTPS server stopped gracefully")
	return nil
}

// Shutdown performs graceful shutdown of the FTP server(s)
// STUB: For now, just returns nil. Full implementation in later phase.
func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("[Server] STUB: Graceful shutdown requested for all FTP servers")

	// STUB: In production, we would:
	// 1. Stop accepting new connections on both servers
	// 2. Wait for active transfers to complete (with timeout)
	// 3. Close database connections
	// 4. Flush Sentry events

	// For now, just log
	if s.implicitServer != nil {
		log.Printf("[Server] STUB: Shutting down implicit FTPS server")
	}
	log.Printf("[Server] STUB: Shutting down explicit FTPS server")
	log.Printf("[Server] STUB: Shutdown complete")
	return nil
}
