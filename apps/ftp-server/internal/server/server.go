package server

import (
	"context"
	"crypto/tls"
	"log"
	"log/slog"
	"os"

	ftpserver "github.com/fclairamb/ftpserverlib"
	ftpslog "github.com/fclairamb/go-log/slog"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/driver"
)

// Server wraps the FTP server(s) and manages their lifecycle
type Server struct {
	explicitServer *ftpserver.FtpServer // Explicit FTPS server (port 2121, AUTH TLS)
	implicitServer *ftpserver.FtpServer // Implicit FTPS server (port 990, immediate TLS)
	config         *config.Config
	clientMgr      *clientmgr.Manager
}

// New creates FTP server instance(s) - explicit FTPS and optionally implicit FTPS
func New(cfg *config.Config, clientMgr *clientmgr.Manager) (*Server, error) {
	return NewWithClient(cfg, clientMgr, nil)
}

// TestServerOptions holds options for creating test servers
type TestServerOptions struct {
	APIClient apiclient.APIClient
	TLSConfig *tls.Config
}

// NewWithClient creates FTP server with a custom API client (for testing)
func NewWithClient(cfg *config.Config, clientMgr *clientmgr.Manager, apiClient apiclient.APIClient) (*Server, error) {
	return NewWithOptions(cfg, clientMgr, TestServerOptions{
		APIClient: apiClient,
		TLSConfig: nil,
	})
}

// NewWithOptions creates FTP server with custom options (for testing)
// Supports both explicit FTPS (main port) and implicit FTPS (if enabled in config)
func NewWithOptions(cfg *config.Config, clientMgr *clientmgr.Manager, opts TestServerOptions) (*Server, error) {
	// Create explicit FTPS driver (supports plain FTP and AUTH TLS upgrade)
	var explicitDriver *driver.MainDriver
	if opts.APIClient != nil {
		explicitDriver = driver.NewMainDriverWithTLS(cfg, clientMgr, opts.APIClient, ftpserver.ClearOrEncrypted, opts.TLSConfig)
	} else {
		explicitDriver = driver.NewMainDriver(cfg, clientMgr)
	}
	explicitServer := ftpserver.NewFtpServer(explicitDriver)

	// Configure FTP protocol debug logging if enabled
	if cfg.FTPDebug {
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
		clientMgr:      clientMgr,
	}

	// Create implicit FTPS server if enabled (immediate TLS on separate port)
	if cfg.ImplicitFTPSEnabled {
		var implicitDriver *driver.MainDriver
		if opts.APIClient != nil {
			implicitDriver = driver.NewMainDriverWithTLS(cfg, clientMgr, opts.APIClient, ftpserver.ImplicitEncryption, opts.TLSConfig)
		} else {
			implicitDriver = driver.NewMainDriverImplicit(cfg, clientMgr)
		}
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
func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("[Server] Graceful shutdown requested for all FTP servers")

	// Stop the client manager event processing
	if s.clientMgr != nil {
		log.Printf("[Server] Stopping client manager")
		s.clientMgr.Stop()
	}

	// Stop FTP servers
	if s.implicitServer != nil {
		log.Printf("[Server] Stopping implicit FTPS server")
		if err := s.implicitServer.Stop(); err != nil {
			log.Printf("[Server] Error stopping implicit server: %v", err)
		}
	}

	log.Printf("[Server] Stopping explicit FTPS server")
	if err := s.explicitServer.Stop(); err != nil {
		log.Printf("[Server] Error stopping explicit server: %v", err)
	}

	log.Printf("[Server] Shutdown complete")
	return nil
}
