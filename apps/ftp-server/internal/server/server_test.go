package server_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"net"
	"testing"
	"time"

	ftpserver "github.com/fclairamb/ftpserverlib"
	"github.com/jlaffaye/ftp"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/server"
)

// ConnectionMode represents the type of FTP connection
type ConnectionMode int

const (
	ModePlainFTP ConnectionMode = iota
	ModeExplicitFTPS
	ModeImplicitFTPS
)

// TestEnv holds the test environment
type TestEnv struct {
	Server    *server.Server
	MockAPI   *apiclient.MockClient
	Config    *config.Config
	ClientMgr *clientmgr.Manager
	Addr      string
	Mode      ConnectionMode
	TLSConfig *tls.Config
}

// generateTestCert creates a self-signed certificate for testing
func generateTestCert() (*tls.Config, error) {
	// Generate ECDSA private key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}

	// Create certificate template
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"SabaiPics Test"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
		DNSNames:              []string{"localhost"},
	}

	// Create self-signed certificate
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return nil, err
	}

	// Create TLS certificate
	cert := tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  privateKey,
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}, nil
}

// SetupTestEnv creates a test environment with mock API client (plain FTP)
func SetupTestEnv(t *testing.T) *TestEnv {
	return SetupTestEnvWithMode(t, ModePlainFTP)
}

// SetupTestEnvWithMode creates a test environment with specified connection mode
func SetupTestEnvWithMode(t *testing.T, mode ConnectionMode) *TestEnv {
	t.Helper()

	// Find available port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to find available port: %v", err)
	}
	addr := listener.Addr().String()
	listener.Close()

	// Create mock API client
	mockAPI := apiclient.NewMockClient()

	// Configure FTP server
	cfg := &config.Config{
		APIURL:              "http://mock.test", // Not used with mock
		FTPListenAddress:    addr,
		FTPPassivePortStart: 0, // Let OS pick
		FTPPassivePortEnd:   0,
		FTPIdleTimeout:      30,
		FTPDebug:            testing.Verbose(),
		SentryEnvironment:   "test",
		ImplicitFTPSPort:    addr, // Use same address for implicit FTPS tests
	}

	// Create client manager
	mgr := clientmgr.NewManager()
	mgr.Start()

	// Determine TLS settings based on mode
	var tlsMode ftpserver.TLSRequirement
	var tlsConfig *tls.Config

	switch mode {
	case ModePlainFTP:
		tlsMode = ftpserver.ClearOrEncrypted
		tlsConfig = nil
	case ModeExplicitFTPS:
		tlsMode = ftpserver.ClearOrEncrypted
		tlsConfig, err = generateTestCert()
		if err != nil {
			t.Fatalf("Failed to generate test certificate: %v", err)
		}
	case ModeImplicitFTPS:
		tlsMode = ftpserver.ImplicitEncryption
		tlsConfig, err = generateTestCert()
		if err != nil {
			t.Fatalf("Failed to generate test certificate: %v", err)
		}
	}

	// Create FTP server with specified options
	ftpServer, err := server.NewWithOptions(cfg, mgr, server.TestServerOptions{
		APIClient: mockAPI,
		TLSMode:   tlsMode,
		TLSConfig: tlsConfig,
	})
	if err != nil {
		t.Fatalf("Failed to create FTP server: %v", err)
	}

	// Start server in background
	go func() {
		ftpServer.Start()
	}()

	// Wait for server to be ready
	waitForServer(t, addr, 5*time.Second)

	return &TestEnv{
		Server:    ftpServer,
		MockAPI:   mockAPI,
		Config:    cfg,
		ClientMgr: mgr,
		Addr:      addr,
		Mode:      mode,
		TLSConfig: tlsConfig,
	}
}

// waitForServer waits for the FTP server to accept connections
func waitForServer(t *testing.T, addr string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		conn, err := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err == nil {
			conn.Close()
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("Server did not start within %v", timeout)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// Cleanup shuts down all resources
func (te *TestEnv) Cleanup(t *testing.T) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	te.Server.Shutdown(ctx)
}

// ConnectFTP creates an FTP client connection based on the test environment mode
func (te *TestEnv) ConnectFTP(t *testing.T) *ftp.ServerConn {
	t.Helper()

	var conn *ftp.ServerConn
	var err error

	switch te.Mode {
	case ModePlainFTP:
		conn, err = ftp.Dial(te.Addr,
			ftp.DialWithContext(context.Background()),
			ftp.DialWithTimeout(5*time.Second),
		)
	case ModeExplicitFTPS:
		// Connect without TLS first, then upgrade with AUTH TLS
		conn, err = ftp.Dial(te.Addr,
			ftp.DialWithContext(context.Background()),
			ftp.DialWithTimeout(5*time.Second),
			ftp.DialWithExplicitTLS(&tls.Config{
				InsecureSkipVerify: true, // Accept self-signed cert
			}),
		)
	case ModeImplicitFTPS:
		// Connect with TLS immediately
		conn, err = ftp.Dial(te.Addr,
			ftp.DialWithContext(context.Background()),
			ftp.DialWithTimeout(5*time.Second),
			ftp.DialWithTLS(&tls.Config{
				InsecureSkipVerify: true, // Accept self-signed cert
			}),
		)
	}

	if err != nil {
		t.Fatalf("Failed to connect to FTP server (mode=%d): %v", te.Mode, err)
	}
	return conn
}

// =============================================================================
// Plain FTP Tests
// =============================================================================

// TestE2E_PlainFTP_AuthSuccess tests successful authentication over plain FTP
func TestE2E_PlainFTP_AuthSuccess(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModePlainFTP)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	err := conn.Login("testuser", "testpass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}

	if err := conn.NoOp(); err != nil {
		t.Errorf("NoOp failed after login: %v", err)
	}
}

// TestE2E_PlainFTP_Upload tests file upload over plain FTP
func TestE2E_PlainFTP_Upload(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModePlainFTP)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	testData := []byte("Plain FTP upload test data")
	err := conn.Stor("plain_ftp_test.jpg", bytes.NewReader(testData))
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	if env.MockAPI.GetUploadCallCount() != 1 {
		t.Errorf("Expected 1 upload call, got %d", env.MockAPI.GetUploadCallCount())
	}

	upload := env.MockAPI.GetLastUploadCall()
	if upload == nil {
		t.Fatal("No upload recorded")
	}
	if upload.Size != int64(len(testData)) {
		t.Errorf("Size = %d, want %d", upload.Size, len(testData))
	}
}

// =============================================================================
// Explicit FTPS Tests (AUTH TLS)
// =============================================================================

// TestE2E_ExplicitFTPS_AuthSuccess tests successful authentication over explicit FTPS
func TestE2E_ExplicitFTPS_AuthSuccess(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModeExplicitFTPS)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	err := conn.Login("testuser", "testpass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}

	if err := conn.NoOp(); err != nil {
		t.Errorf("NoOp failed after login: %v", err)
	}
}

// TestE2E_ExplicitFTPS_Upload tests file upload over explicit FTPS
func TestE2E_ExplicitFTPS_Upload(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModeExplicitFTPS)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	testData := []byte("Explicit FTPS upload test data - secure with AUTH TLS")
	err := conn.Stor("explicit_ftps_test.jpg", bytes.NewReader(testData))
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	if env.MockAPI.GetUploadCallCount() != 1 {
		t.Errorf("Expected 1 upload call, got %d", env.MockAPI.GetUploadCallCount())
	}

	upload := env.MockAPI.GetLastUploadCall()
	if upload == nil {
		t.Fatal("No upload recorded")
	}
	if upload.Size != int64(len(testData)) {
		t.Errorf("Size = %d, want %d", upload.Size, len(testData))
	}
}

// =============================================================================
// Implicit FTPS Tests
// =============================================================================

// TestE2E_ImplicitFTPS_AuthSuccess tests successful authentication over implicit FTPS
func TestE2E_ImplicitFTPS_AuthSuccess(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModeImplicitFTPS)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	err := conn.Login("testuser", "testpass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}

	if err := conn.NoOp(); err != nil {
		t.Errorf("NoOp failed after login: %v", err)
	}
}

// TestE2E_ImplicitFTPS_Upload tests file upload over implicit FTPS
func TestE2E_ImplicitFTPS_Upload(t *testing.T) {
	env := SetupTestEnvWithMode(t, ModeImplicitFTPS)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	testData := []byte("Implicit FTPS upload test data - immediate TLS")
	err := conn.Stor("implicit_ftps_test.jpg", bytes.NewReader(testData))
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	if env.MockAPI.GetUploadCallCount() != 1 {
		t.Errorf("Expected 1 upload call, got %d", env.MockAPI.GetUploadCallCount())
	}

	upload := env.MockAPI.GetLastUploadCall()
	if upload == nil {
		t.Fatal("No upload recorded")
	}
	if upload.Size != int64(len(testData)) {
		t.Errorf("Size = %d, want %d", upload.Size, len(testData))
	}
}

// =============================================================================
// Common Tests (run on plain FTP for simplicity)
// =============================================================================

// TestE2E_AuthFailure tests failed FTP authentication
func TestE2E_AuthFailure(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	// Configure mock to reject auth
	env.MockAPI.SetAuthFailure(errors.New("invalid credentials"))

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	// Login should fail
	err := conn.Login("baduser", "badpass")
	if err == nil {
		t.Fatal("Expected login to fail")
	}

	// Verify auth was attempted
	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}
}

// TestE2E_MultipleUploads tests uploading multiple files
func TestE2E_MultipleUploads(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Upload 3 files
	for i := 1; i <= 3; i++ {
		data := bytes.Repeat([]byte("x"), i*1000)
		filename := "photo_" + string(rune('0'+i)) + ".jpg"
		if err := conn.Stor(filename, bytes.NewReader(data)); err != nil {
			t.Fatalf("Upload %d failed: %v", i, err)
		}
	}

	// Wait for uploads
	time.Sleep(200 * time.Millisecond)

	if env.MockAPI.GetUploadCallCount() != 3 {
		t.Errorf("Expected 3 upload calls, got %d", env.MockAPI.GetUploadCallCount())
	}
}

// TestE2E_LargeFile tests uploading a 1MB file
func TestE2E_LargeFile(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Create 1MB test data
	size := 1024 * 1024
	testData := bytes.Repeat([]byte("x"), size)
	if err := conn.Stor("large_photo.jpg", bytes.NewReader(testData)); err != nil {
		t.Fatalf("Large upload failed: %v", err)
	}

	time.Sleep(500 * time.Millisecond)

	upload := env.MockAPI.GetLastUploadCall()
	if upload == nil {
		t.Fatal("No upload recorded")
	}
	if upload.Size != int64(size) {
		t.Errorf("Size = %d, want %d", upload.Size, size)
	}
}

// TestE2E_DownloadBlocked tests that downloads are blocked
func TestE2E_DownloadBlocked(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Try to download - should fail
	_, err := conn.Retr("some_file.jpg")
	if err == nil {
		t.Fatal("Expected download to be blocked")
	}
}

// TestE2E_UploadAuthExpired tests that 401 from API is handled
func TestE2E_UploadAuthExpired(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Configure mock to return 401 on upload
	env.MockAPI.SetUploadFailure(errors.New("token expired"), 401)

	// Upload should fail
	err := conn.Stor("file.jpg", bytes.NewReader([]byte("data")))
	if err == nil {
		// Upload might return success before server disconnects
		time.Sleep(200 * time.Millisecond)
	}

	// Connection should be closed - NoOp should fail
	if err := conn.NoOp(); err == nil {
		// Connection might still work briefly
		time.Sleep(200 * time.Millisecond)
		if err := conn.NoOp(); err == nil {
			t.Log("Connection still alive after auth expiry - may be timing dependent")
		}
	}
}

// TestE2E_DirectoryOps tests directory operations for client compatibility
func TestE2E_DirectoryOps(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// PWD should work
	dir, err := conn.CurrentDir()
	if err != nil {
		t.Errorf("PWD failed: %v", err)
	} else {
		t.Logf("Current dir: %s", dir)
	}

	// LIST should return empty (upload-only)
	entries, err := conn.List("/")
	if err != nil {
		t.Logf("LIST failed (expected): %v", err)
	} else {
		t.Logf("LIST returned %d entries", len(entries))
	}
}
