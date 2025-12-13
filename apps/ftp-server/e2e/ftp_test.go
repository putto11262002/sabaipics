// Package e2e provides end-to-end tests for the FTP server.
//
// These tests require:
// 1. A running mock API server (started by the test)
// 2. A running FTP server configured to use the mock API
//
// Run with: E2E_TEST=1 go test -v ./e2e/...
//
// For manual testing:
//  1. Start mock API: go run ./e2e/cmd/mockapi
//  2. Start FTP server: API_URL=http://localhost:8080 go run ./cmd/ftp-server
//  3. Run tests: E2E_TEST=1 FTP_HOST=localhost FTP_PORT=2121 go test -v ./e2e/...
package e2e

import (
	"bytes"
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/jlaffaye/ftp"
)

var (
	ftpHost string
	ftpPort int
)

func init() {
	ftpHost = os.Getenv("FTP_HOST")
	if ftpHost == "" {
		ftpHost = "localhost"
	}

	portStr := os.Getenv("FTP_PORT")
	if portStr == "" {
		ftpPort = 2121
	} else {
		p, err := strconv.Atoi(portStr)
		if err != nil {
			ftpPort = 2121
		} else {
			ftpPort = p
		}
	}
}

func skipIfNotE2E(t *testing.T) {
	t.Helper()
	if os.Getenv("E2E_TEST") == "" {
		t.Skip("Skipping E2E test (set E2E_TEST=1 to run)")
	}
}

func ftpAddr() string {
	return ftpHost + ":" + strconv.Itoa(ftpPort)
}

func connectFTP(t *testing.T) *ftp.ServerConn {
	t.Helper()

	conn, err := ftp.Dial(ftpAddr(),
		ftp.DialWithContext(context.Background()),
		ftp.DialWithTimeout(10*time.Second),
	)
	if err != nil {
		t.Fatalf("Failed to connect to FTP server at %s: %v", ftpAddr(), err)
	}
	return conn
}

// TestE2E_AuthSuccess tests successful FTP authentication
func TestE2E_AuthSuccess(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	// Login with valid credentials (these must match what the API accepts)
	err := conn.Login("test", "pass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Verify we can issue commands after login
	if err := conn.NoOp(); err != nil {
		t.Errorf("NoOp failed after login: %v", err)
	}

	t.Log("Auth success: logged in and issued NoOp command")
}

// TestE2E_AuthFailure tests failed FTP authentication
func TestE2E_AuthFailure(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	// Login with invalid credentials
	err := conn.Login("wrong", "credentials")
	if err == nil {
		t.Fatal("Expected login to fail with invalid credentials")
	}

	t.Logf("Auth failure: got expected error: %v", err)
}

// TestE2E_Upload tests successful file upload
func TestE2E_Upload(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Upload a small test file
	testData := []byte("This is test image data for E2E testing")
	err := conn.Stor("test_photo.jpg", bytes.NewReader(testData))
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	t.Logf("Upload success: uploaded %d bytes as test_photo.jpg", len(testData))
}

// TestE2E_MultipleUploads tests uploading multiple files in one session
func TestE2E_MultipleUploads(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Upload 3 files
	for i := 1; i <= 3; i++ {
		data := bytes.Repeat([]byte("x"), i*1000)
		filename := "photo_" + strconv.Itoa(i) + ".jpg"
		if err := conn.Stor(filename, bytes.NewReader(data)); err != nil {
			t.Fatalf("Upload %d (%s) failed: %v", i, filename, err)
		}
		t.Logf("Uploaded %s (%d bytes)", filename, len(data))
	}

	t.Log("Multiple uploads success: uploaded 3 files")
}

// TestE2E_LargeFile tests uploading a larger file (1MB)
func TestE2E_LargeFile(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
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

	t.Logf("Large file upload success: uploaded %d bytes", size)
}

// TestE2E_DownloadBlocked tests that downloads are blocked (upload-only)
func TestE2E_DownloadBlocked(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Try to download - should fail
	_, err := conn.Retr("some_file.jpg")
	if err == nil {
		t.Fatal("Expected download to be blocked, but it succeeded")
	}

	t.Logf("Download blocked: got expected error: %v", err)
}

// TestE2E_DirectoryOperations tests that directory operations work (for client compatibility)
func TestE2E_DirectoryOperations(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// PWD should work
	currentDir, err := conn.CurrentDir()
	if err != nil {
		t.Errorf("PWD failed: %v", err)
	} else {
		t.Logf("Current directory: %s", currentDir)
	}

	// CWD should work (even though directories are virtual)
	if err := conn.ChangeDir("/uploads"); err != nil {
		t.Logf("CWD to /uploads: %v (may be expected)", err)
	}

	// LIST should return empty (no files to list)
	entries, err := conn.List("/")
	if err != nil {
		t.Logf("LIST failed: %v (may be expected for upload-only)", err)
	} else {
		t.Logf("LIST returned %d entries", len(entries))
	}
}

// TestE2E_ConnectionPersistence tests that connection stays alive for multiple operations
func TestE2E_ConnectionPersistence(t *testing.T) {
	skipIfNotE2E(t)

	conn := connectFTP(t)
	defer conn.Quit()

	if err := conn.Login("test", "pass"); err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	// Issue multiple NoOp commands with delays
	for i := 0; i < 5; i++ {
		if err := conn.NoOp(); err != nil {
			t.Fatalf("NoOp %d failed: %v", i+1, err)
		}
		time.Sleep(100 * time.Millisecond)
	}

	// Upload a file after the delays
	testData := []byte("persistence test data")
	if err := conn.Stor("persistence_test.jpg", bytes.NewReader(testData)); err != nil {
		t.Fatalf("Upload after delays failed: %v", err)
	}

	t.Log("Connection persistence: connection stayed alive through multiple operations")
}
