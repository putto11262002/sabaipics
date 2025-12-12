package driver

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	"github.com/fclairamb/ftpserverlib"
	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/client"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
)

// MainDriver implements the ftpserverlib.MainDriver interface
// Logs application flow events at FTP protocol boundaries
type MainDriver struct {
	db        *pgxpool.Pool
	config    *config.Config
	apiClient *apiclient.Client
	// tlsMode specifies the TLS requirement mode for this FTP server
	tlsMode ftpserver.TLSRequirement
}

// NewMainDriver creates a new MainDriver instance for explicit FTPS (AUTH TLS)
func NewMainDriver(db *pgxpool.Pool, cfg *config.Config) *MainDriver {
	return &MainDriver{
		db:        db,
		config:    cfg,
		apiClient: apiclient.NewClient(cfg.APIURL),
		tlsMode:   ftpserver.ClearOrEncrypted, // Explicit FTPS (optional TLS via AUTH TLS)
	}
}

// NewMainDriverImplicit creates a new MainDriver instance for implicit FTPS
func NewMainDriverImplicit(db *pgxpool.Pool, cfg *config.Config) *MainDriver {
	return &MainDriver{
		db:        db,
		config:    cfg,
		apiClient: apiclient.NewClient(cfg.APIURL),
		tlsMode:   ftpserver.ImplicitEncryption, // Implicit FTPS (immediate TLS)
	}
}

// log returns a Sentry logger for application-level events
// Upload-level tracing is now handled in UploadTransfer, not at connection level
func (d *MainDriver) log() sentry.Logger {
	return sentry.NewLogger(context.Background())
}

// GetSettings returns FTP server settings
func (d *MainDriver) GetSettings() (*ftpserver.Settings, error) {
	listenAddr := d.config.FTPListenAddress

	// If this is an implicit FTPS server, use the implicit FTPS port
	if d.tlsMode == ftpserver.ImplicitEncryption {
		listenAddr = d.config.ImplicitFTPSPort
	}

	return &ftpserver.Settings{
		ListenAddr: listenAddr,
		PassiveTransferPortRange: &ftpserver.PortRange{
			Start: d.config.FTPPassivePortStart,
			End:   d.config.FTPPassivePortEnd,
		},
		IdleTimeout: d.config.FTPIdleTimeout,
		TLSRequired: d.tlsMode, // Set TLS requirement mode
	}, nil
}

// ClientConnected is called when a client connects (application boundary)
func (d *MainDriver) ClientConnected(cc ftpserver.ClientContext) (string, error) {
	clientIP := cc.RemoteAddr().String()
	clientID := cc.ID()

	// Enable FTP protocol debug mode if configured
	if d.config.FTPDebug {
		cc.SetDebug(true)
	}

	// Log at application boundary (no transaction - uploads create their own)
	d.log().Info().Emitf("Client connected: %s (ID: %d)", clientIP, clientID)

	return fmt.Sprintf("Welcome to SabaiPics FTP Server (Client: %s)", clientIP), nil
}

// ClientDisconnected is called when a client disconnects (application boundary)
func (d *MainDriver) ClientDisconnected(cc ftpserver.ClientContext) {
	clientID := cc.ID()
	clientIP := cc.RemoteAddr().String()

	// Log at application boundary (no transaction cleanup needed)
	d.log().Info().Emitf("Client disconnected: %s (ID: %d)", clientIP, clientID)
}

// AuthUser validates FTP credentials via API and returns ClientDriver with JWT token
func (d *MainDriver) AuthUser(cc ftpserver.ClientContext, user, pass string) (ftpserver.ClientDriver, error) {
	clientIP := cc.RemoteAddr().String()

	// Log auth attempt at application boundary
	d.log().Info().Emitf("Auth attempt: user=%s, client=%s", user, clientIP)

	// Create context with timeout for auth request
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Call API for authentication
	authResp, err := d.apiClient.Authenticate(ctx, apiclient.AuthRequest{
		Username: user,
		Password: pass,
	})
	if err != nil {
		d.log().Error().Emitf("FTP auth failed for user=%s: %v", user, err)
		return nil, fmt.Errorf("authentication failed") // FTP 530 response
	}

	d.log().Info().Emitf("FTP auth successful: user=%s, event=%s, credits=%d",
		user, authResp.EventID, authResp.CreditsRemaining)

	// Create ClientDriver with JWT token, ClientContext (for disconnect), and API client
	clientDriver := client.NewClientDriver(
		authResp.EventID,
		authResp.Token,
		clientIP,
		cc, // Pass ClientContext for disconnect on auth expiry
		d.apiClient,
		d.config,
	)

	return clientDriver, nil
}

// GetTLSConfig returns TLS configuration for FTPS
func (d *MainDriver) GetTLSConfig() (*tls.Config, error) {
	// If TLS cert/key paths are not configured, return nil (plain FTP)
	if d.config.TLSCertPath == "" || d.config.TLSKeyPath == "" {
		return nil, nil
	}

	// Load TLS certificate and private key
	cert, err := tls.LoadX509KeyPair(d.config.TLSCertPath, d.config.TLSKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load TLS certificate: %w", err)
	}

	// Return TLS configuration for FTPS (explicit mode - AUTH TLS)
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12, // Require TLS 1.2 or higher
		CipherSuites: []uint16{
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		},
	}, nil
}
