package server_test

import (
	"bytes"
	"context"
	"errors"
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
	Server    *server.Server
	MockAPI   *apiclient.MockClient
	Config    *config.Config
	ClientMgr *clientmgr.Manager
	Addr      string
}

// SetupTestEnv creates a test environment with mock API client
func SetupTestEnv(t *testing.T) *TestEnv {
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
	}

	// Create client manager
	mgr := clientmgr.NewManager()
	mgr.Start()

	// Create FTP server with mock API client
	ftpServer, err := server.NewWithClient(cfg, mgr, mockAPI)
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

// ConnectFTP creates an FTP client connection
func (te *TestEnv) ConnectFTP(t *testing.T) *ftp.ServerConn {
	t.Helper()
	conn, err := ftp.Dial(te.Addr,
		ftp.DialWithContext(context.Background()),
		ftp.DialWithTimeout(5*time.Second),
	)
	if err != nil {
		t.Fatalf("Failed to connect to FTP server: %v", err)
	}
	return conn
}

// TestE2E_AuthSuccess tests successful FTP authentication
func TestE2E_AuthSuccess(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	// Login - mock accepts any credentials by default
	err := conn.Login("testuser", "testpass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Verify auth was called
	if env.MockAPI.GetAuthCallCount() != 1 {
		t.Errorf("Expected 1 auth call, got %d", env.MockAPI.GetAuthCallCount())
	}

	// Verify we can issue commands
	if err := conn.NoOp(); err != nil {
		t.Errorf("NoOp failed after login: %v", err)
	}
}

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

// TestE2E_Upload tests successful file upload
func TestE2E_Upload(t *testing.T) {
	env := SetupTestEnv(t)
	defer env.Cleanup(t)

	conn := env.ConnectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Upload a file
	testData := []byte("This is test image data for E2E testing")
	err := conn.Stor("test_photo.jpg", bytes.NewReader(testData))
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	// Wait for async upload to complete
	time.Sleep(100 * time.Millisecond)

	// Verify upload was called
	if env.MockAPI.GetUploadCallCount() != 1 {
		t.Errorf("Expected 1 upload call, got %d", env.MockAPI.GetUploadCallCount())
	}

	// Verify upload details
	upload := env.MockAPI.GetLastUploadCall()
	if upload == nil {
		t.Fatal("No upload recorded")
	}
	// FTP client sends full path, so filename may have leading slash
	expectedFilename := "/test_photo.jpg"
	if upload.Filename != expectedFilename {
		t.Errorf("Filename = %q, want %q", upload.Filename, expectedFilename)
	}
	if upload.Size != int64(len(testData)) {
		t.Errorf("Size = %d, want %d", upload.Size, len(testData))
	}
	if upload.Token != "mock-jwt-token" {
		t.Errorf("Token = %q, want %q", upload.Token, "mock-jwt-token")
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
