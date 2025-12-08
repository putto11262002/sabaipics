package driver

import (
	"context"
	"crypto/tls"
	"fmt"

	"github.com/fclairamb/ftpserverlib"
	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/client"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
)

// MainDriver implements the ftpserverlib.MainDriver interface
// Logs application flow events at FTP protocol boundaries
type MainDriver struct {
	db     *pgxpool.Pool
	config *config.Config
	// transactions tracks Sentry transactions by client ID for distributed tracing
	transactions map[uint32]*sentry.Span
	// tlsMode specifies the TLS requirement mode for this FTP server
	tlsMode ftpserver.TLSRequirement
}

// NewMainDriver creates a new MainDriver instance for explicit FTPS (AUTH TLS)
func NewMainDriver(db *pgxpool.Pool, cfg *config.Config) *MainDriver {
	return &MainDriver{
		db:           db,
		config:       cfg,
		transactions: make(map[uint32]*sentry.Span),
		tlsMode:      ftpserver.ClearOrEncrypted, // Explicit FTPS (optional TLS via AUTH TLS)
	}
}

// NewMainDriverImplicit creates a new MainDriver instance for implicit FTPS
func NewMainDriverImplicit(db *pgxpool.Pool, cfg *config.Config) *MainDriver {
	return &MainDriver{
		db:           db,
		config:       cfg,
		transactions: make(map[uint32]*sentry.Span),
		tlsMode:      ftpserver.ImplicitEncryption, // Implicit FTPS (immediate TLS)
	}
}

// log returns a Sentry logger bound to the client's transaction context
func (d *MainDriver) log(clientID uint32) sentry.Logger {
	if txn, exists := d.transactions[clientID]; exists && txn != nil {
		return sentry.NewLogger(txn.Context())
	}
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

	// Create root Sentry transaction for this connection
	ctx := context.Background()
	transaction := sentry.StartTransaction(ctx,
		fmt.Sprintf("ftp.connection.%d", clientID),
		sentry.WithTransactionSource(sentry.SourceCustom),
	)
	transaction.SetTag("client.ip", clientIP)
	transaction.SetTag("client.id", fmt.Sprintf("%d", clientID))
	transaction.SetData("server.port", d.config.FTPListenAddress)

	// Store transaction for later retrieval in child operations
	d.transactions[clientID] = transaction

	// Log at application boundary
	d.log(clientID).Info().Emitf("Client connected: %s (ID: %d)", clientIP, clientID)

	return fmt.Sprintf("Welcome to SabaiPics FTP Server (Client: %s)", clientIP), nil
}

// ClientDisconnected is called when a client disconnects (application boundary)
func (d *MainDriver) ClientDisconnected(cc ftpserver.ClientContext) {
	clientID := cc.ID()
	clientIP := cc.RemoteAddr().String()

	// Log at application boundary before finishing transaction
	d.log(clientID).Info().Emitf("Client disconnected: %s (ID: %d)", clientIP, clientID)

	// Finish the Sentry transaction if it exists
	if transaction, exists := d.transactions[clientID]; exists {
		transaction.Finish()
		delete(d.transactions, clientID)
	}
}

// AuthUser validates FTP credentials (application boundary)
// STUB: Returns mock ClientDriver instead of querying the database
func (d *MainDriver) AuthUser(cc ftpserver.ClientContext, user, pass string) (ftpserver.ClientDriver, error) {
	clientID := cc.ID()
	clientIP := cc.RemoteAddr().String()

	// Get the parent transaction context
	var parentCtx context.Context
	var authSpan *sentry.Span

	if transaction, exists := d.transactions[clientID]; exists {
		// Create child span using parent transaction's context
		parentCtx = transaction.Context()
		authSpan = sentry.StartSpan(parentCtx, "ftp.auth")
		defer authSpan.Finish()

		authSpan.SetTag("ftp.username", user)
		authSpan.SetTag("client.ip", clientIP)
	} else {
		// No transaction found - use background context
		parentCtx = context.Background()
	}

	// Log auth attempt at application boundary
	d.log(clientID).Info().Emitf("Auth attempt: user=%s, client=%s", user, clientIP)

	// STUB: In real implementation, we would:
	// 1. Query: SELECT * FROM events WHERE ftp_username = $1
	// 2. Verify: bcrypt.CompareHashAndPassword(event.ftp_password_hash, []byte(pass))
	// 3. Check: Event published, upload window open, not deleted
	// 4. Return ClientDriver with actual eventID and photographerID

	// For now, accept any credentials for testing
	eventID := "stub-event-id"
	photographerID := "stub-photographer-id"

	// Log stub acceptance
	d.log(clientID).Debug().Emitf("STUB: Accepting credentials for user=%s (no DB validation)", user)

	// Create mock ClientDriver with parent context for upload span propagation
	clientDriver := client.NewClientDriver(eventID, photographerID, d.config, parentCtx)

	// Add event context to Sentry span
	if authSpan != nil {
		authSpan.SetTag("event.id", eventID)
		authSpan.SetTag("photographer.id", photographerID)
	}

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
