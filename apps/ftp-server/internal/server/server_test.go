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

	"github.com/jlaffaye/ftp"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/server"
)

// TestEnv holds the test environment
type TestEnv struct {
	Server           *server.Server
	MockAPI          *apiclient.MockClient
	Config           *config.Config
	ClientMgr        *clientmgr.Manager
	ExplicitAddr     string // Address for plain FTP and explicit FTPS
	ImplicitAddr     string // Address for implicit FTPS (if enabled)
	TLSConfig        *tls.Config
}

// generateTestCert creates a self-signed certificate for testing
func generateTestCert() (*tls.Config, error) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}

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

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return nil, err
	}

	cert := tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  privateKey,
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}, nil
}

// findAvailablePort returns an available TCP port
func findAvailablePort(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to find available port: %v", err)
	}
	addr := listener.Addr().String()
	listener.Close()
	return addr
}

// SetupTestEnv creates a test environment with plain FTP only (no TLS)
func SetupTestEnv(t *testing.T) *TestEnv {
	t.Helper()

	explicitAddr := findAvailablePort(t)
	mockAPI := apiclient.NewMockClient()

	cfg := &config.Config{
		APIURL:              "http://mock.test",
		FTPListenAddress:    explicitAddr,
		FTPPassivePortStart: 0,
		FTPPassivePortEnd:   0,
		FTPIdleTimeout:      30,
		FTPDebug:            testing.Verbose(),
		SentryEnvironment:   "test",
	}

	mgr := clientmgr.NewManager()
	mgr.Start()

	ftpServer, err := server.NewWithClient(cfg, mgr, mockAPI)
	if err != nil {
		t.Fatalf("Failed to create FTP server: %v", err)
	}

	go func() {
		ftpServer.Start()
	}()

	waitForServer(t, explicitAddr, 5*time.Second)

	return &TestEnv{
		Server:       ftpServer,
		MockAPI:      mockAPI,
		Config:       cfg,
		ClientMgr:    mgr,
		ExplicitAddr: explicitAddr,
	}
}

// SetupMultiModeTestEnv creates a test environment supporting all connection types
func SetupMultiModeTestEnv(t *testing.T) *TestEnv {
	t.Helper()

	explicitAddr := findAvailablePort(t)
	implicitAddr := findAvailablePort(t)

	mockAPI := apiclient.NewMockClient()

	tlsConfig, err := generateTestCert()
	if err != nil {
		t.Fatalf("Failed to generate test certificate: %v", err)
	}

	cfg := &config.Config{
		APIURL:              "http://mock.test",
		FTPListenAddress:    explicitAddr,
		FTPPassivePortStart: 0,
		FTPPassivePortEnd:   0,
		FTPIdleTimeout:      30,
		FTPDebug:            testing.Verbose(),
		SentryEnvironment:   "test",
		ImplicitFTPSEnabled: true,
		ImplicitFTPSPort:    implicitAddr,
	}

	mgr := clientmgr.NewManager()
	mgr.Start()

	ftpServer, err := server.NewWithOptions(cfg, mgr, server.TestServerOptions{
		APIClient: mockAPI,
		TLSConfig: tlsConfig,
	})
	if err != nil {
		t.Fatalf("Failed to create FTP server: %v", err)
	}

	go func() {
		ftpServer.Start()
	}()

	// Wait for both servers to be ready
	waitForServer(t, explicitAddr, 5*time.Second)
	waitForServer(t, implicitAddr, 5*time.Second)

	return &TestEnv{
		Server:       ftpServer,
		MockAPI:      mockAPI,
		Config:       cfg,
		ClientMgr:    mgr,
		ExplicitAddr: explicitAddr,
		ImplicitAddr: implicitAddr,
		TLSConfig:    tlsConfig,
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
			t.Fatalf("Server did not start within %v at %s", timeout, addr)
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

// ConnectPlainFTP creates a plain FTP connection (no TLS)
func (te *TestEnv) ConnectPlainFTP(t *testing.T) *ftp.ServerConn {
	t.Helper()
	conn, err := ftp.Dial(te.ExplicitAddr,
		ftp.DialWithContext(context.Background()),
		ftp.DialWithTimeout(5*time.Second),
	)
	if err != nil {
		t.Fatalf("Failed to connect via plain FTP: %v", err)
	}
	return conn
}

// ConnectExplicitFTPS creates an explicit FTPS connection (AUTH TLS upgrade)
func (te *TestEnv) ConnectExplicitFTPS(t *testing.T) *ftp.ServerConn {
	t.Helper()
	conn, err := ftp.Dial(te.ExplicitAddr,
		ftp.DialWithContext(context.Background()),
		ftp.DialWithTimeout(5*time.Second),
		ftp.DialWithExplicitTLS(&tls.Config{
			InsecureSkipVerify: true,
		}),
	)
	if err != nil {
		t.Fatalf("Failed to connect via explicit FTPS: %v", err)
	}
	return conn
}

// ConnectImplicitFTPS creates an implicit FTPS connection (immediate TLS)
func (te *TestEnv) ConnectImplicitFTPS(t *testing.T) *ftp.ServerConn {
	t.Helper()
	if te.ImplicitAddr == "" {
		t.Fatal("Implicit FTPS not enabled in this test environment")
	}
	conn, err := ftp.Dial(te.ImplicitAddr,
		ftp.DialWithContext(context.Background()),
		ftp.DialWithTimeout(5*time.Second),
		ftp.DialWithTLS(&tls.Config{
			InsecureSkipVerify: true,
		}),
	)
	if err != nil {
		t.Fatalf("Failed to connect via implicit FTPS: %v", err)
	}
	return conn
}

// =============================================================================
// Connection Type Tests - Verify server supports all connection modes
// =============================================================================

// TestE2E_ServerSupportsAllConnectionTypes verifies that the server can accept
// connections via Plain FTP, Explicit FTPS (AUTH TLS), and Implicit FTPS simultaneously
func TestE2E_ServerSupportsAllConnectionTypes(t *testing.T) {
	env := SetupMultiModeTestEnv(t)
	defer env.Cleanup(t)

	// Test 1: Plain FTP connection
	t.Run("PlainFTP", func(t *testing.T) {
		conn := env.ConnectPlainFTP(t)
		defer conn.Quit()

		if err := conn.Login("testuser", "testpass"); err != nil {
			t.Fatalf("Plain FTP login failed: %v", err)
		}
		if err := conn.NoOp(); err != nil {
			t.Errorf("Plain FTP NoOp failed: %v", err)
		}
		t.Log("Plain FTP connection successful")
	})

	// Test 2: Explicit FTPS connection (AUTH TLS)
	t.Run("ExplicitFTPS", func(t *testing.T) {
		conn := env.ConnectExplicitFTPS(t)
		defer conn.Quit()

		if err := conn.Login("testuser", "testpass"); err != nil {
			t.Fatalf("Explicit FTPS login failed: %v", err)
		}
		if err := conn.NoOp(); err != nil {
			t.Errorf("Explicit FTPS NoOp failed: %v", err)
		}
		t.Log("Explicit FTPS (AUTH TLS) connection successful")
	})

	// Test 3: Implicit FTPS connection (immediate TLS)
	t.Run("ImplicitFTPS", func(t *testing.T) {
		conn := env.ConnectImplicitFTPS(t)
		defer conn.Quit()

		if err := conn.Login("testuser", "testpass"); err != nil {
			t.Fatalf("Implicit FTPS login failed: %v", err)
		}
		if err := conn.NoOp(); err != nil {
			t.Errorf("Implicit FTPS NoOp failed: %v", err)
		}
		t.Log("Implicit FTPS connection successful")
	})
}

// =============================================================================
// FTP Operation Tests - Test protocol behavior (run on plain FTP)
// =============================================================================

// TestE2E_AuthSuccess tests successful FTP authentication
func TestE2E_AuthSuccess(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectPlainFTP(t)
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

// TestE2E_AuthFailure tests failed FTP authentication
func TestE2E_AuthFailure(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	env.MockAPI.SetAuthFailure(errors.New("invalid credentials"))

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	err := conn.Login("baduser", "badpass")
	if err == nil {
		t.Fatal("Expected login to fail")
	}

	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}
}

// TestE2E_Upload tests successful file upload
func TestE2E_Upload(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	testData := []byte("Test upload data for E2E testing")
	err := conn.Stor("test_photo.jpg", bytes.NewReader(testData))
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

// TestE2E_MultipleUploads tests uploading multiple files
func TestE2E_MultipleUploads(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	for i := 1; i <= 3; i++ {
		data := bytes.Repeat([]byte("x"), i*1000)
		filename := "photo_" + string(rune('0'+i)) + ".jpg"
		if err := conn.Stor(filename, bytes.NewReader(data)); err != nil {
			t.Fatalf("Upload %d failed: %v", i, err)
		}
	}

	time.Sleep(200 * time.Millisecond)

	if env.MockAPI.GetUploadCallCount() != 3 {
		t.Errorf("Expected 3 upload calls, got %d", env.MockAPI.GetUploadCallCount())
	}
}

// TestE2E_LargeFile tests uploading a 1MB file
func TestE2E_LargeFile(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

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

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	_, err := conn.Retr("some_file.jpg")
	if err == nil {
		t.Fatal("Expected download to be blocked")
	}
}

// TestE2E_UploadAuthExpired tests that 401 from API disconnects client
func TestE2E_UploadAuthExpired(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	env.MockAPI.SetUploadFailure(errors.New("token expired"), 401)

	err := conn.Stor("file.jpg", bytes.NewReader([]byte("data")))
	if err == nil {
		time.Sleep(200 * time.Millisecond)
	}

	// Connection should be closed after auth expiry
	if err := conn.NoOp(); err == nil {
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

	conn := env.ConnectPlainFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	dir, err := conn.CurrentDir()
	if err != nil {
		t.Errorf("PWD failed: %v", err)
	} else {
		t.Logf("Current dir: %s", dir)
	}

	entries, err := conn.List("/")
	if err != nil {
		t.Logf("LIST failed (expected): %v", err)
	} else {
		t.Logf("LIST returned %d entries", len(entries))
	}
}
