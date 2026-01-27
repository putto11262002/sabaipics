package client

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/mime"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/transfer"
	"github.com/spf13/afero"
)

// ClientDriver implements ftpserverlib.ClientDriver interface (afero.Fs)
// This driver enforces upload-only operations without logging (returns error sentinels)
// Logging is the responsibility of MainDriver at application boundaries
type ClientDriver struct {
	eventID   string
	jwtToken  string
	clientIP  string // Client IP address for upload transaction context
	clientID  uint32 // Client ID for event reporting to hub
	clientMgr *clientmgr.Manager
	apiClient apiclient.APIClient
	config    *config.Config
}

// NewClientDriver creates a new ClientDriver instance with JWT token, API client, and client manager
func NewClientDriver(eventID, jwtToken, clientIP string, clientID uint32, clientMgr *clientmgr.Manager, apiClient apiclient.APIClient, cfg *config.Config) *ClientDriver {
	return &ClientDriver{
		eventID:   eventID,
		jwtToken:  jwtToken,
		clientIP:  clientIP,
		clientID:  clientID,
		clientMgr: clientMgr,
		apiClient: apiClient,
		config:    cfg,
	}
}

// Name returns the name of this driver
func (d *ClientDriver) Name() string {
	return "UploadOnlyDriver"
}

// OpenFile opens a file for writing (STOR command)
func (d *ClientDriver) OpenFile(name string, flag int, perm os.FileMode) (afero.File, error) {
	// Check if this is a write operation
	if flag&os.O_WRONLY == 0 && flag&os.O_RDWR == 0 {
		return nil, ErrDownloadNotAllowed
	}

	// Detect MIME type from filename
	contentType := mime.FromFilename(name)

	// Presign with retry on 429
	var presignResp *apiclient.PresignResponse
	var httpResp *http.Response
	var err error

	backoff := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second}

	for attempt := 0; attempt <= len(backoff); attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		presignResp, httpResp, err = d.apiClient.Presign(ctx, d.jwtToken, name, contentType)
		cancel()

		if err == nil {
			// Success
			break
		}

		if httpResp != nil && httpResp.StatusCode == 429 && attempt < len(backoff) {
			// Rate limited - retry with backoff
			retryAfter := parseRetryAfter(httpResp) // Check Retry-After header
			if retryAfter > 0 {
				time.Sleep(retryAfter)
			} else {
				time.Sleep(backoff[attempt])
			}
			continue
		}

		// Non-429 error or exhausted retries
		return nil, mapPresignError(err, httpResp)
	}

	// Create UploadTransfer with presigned URL
	uploadTransfer := transfer.NewUploadTransfer(
		d.eventID,
		d.jwtToken,
		d.clientIP,
		name,
		presignResp.PutURL,
		presignResp.RequiredHeaders,
		d.clientID,
		d.clientMgr,
		d.apiClient,
	)

	return uploadTransfer, nil
}

// Open blocks file reading (RETR command)
func (d *ClientDriver) Open(name string) (afero.File, error) {
	return nil, ErrDownloadNotAllowed
}

// Remove accepts file deletion but does nothing (no-op for client compatibility)
// Returns success so clients can clean up temp files in their upload workflows
func (d *ClientDriver) Remove(name string) error {
	return nil // Success (250 OK in FTP)
}

// Rename accepts file renaming but does nothing (no-op for client compatibility)
// Many clients use atomic upload pattern: upload as temp name, then rename to final name
func (d *ClientDriver) Rename(oldname, newname string) error {
	return nil // Success (250 OK in FTP)
}

// Mkdir accepts directory creation but does nothing (no-op for client compatibility)
// Clients often organize uploads into directories (e.g., by date, device, etc.)
func (d *ClientDriver) Mkdir(name string, perm os.FileMode) error {
	return nil // Success (257 Created in FTP)
}

// MkdirAll accepts recursive directory creation but does nothing (no-op)
func (d *ClientDriver) MkdirAll(path string, perm os.FileMode) error {
	return nil // Success
}

// Stat returns fake file info for client compatibility
// Clients check file existence, sizes, timestamps, and directory status
// Treats "/" and any path ending with "/" as directories for CWD compatibility
// Treats paths with common directory names as directories
func (d *ClientDriver) Stat(name string) (os.FileInfo, error) {
	// Detect directories: root, empty, trailing slash, or common dir names
	isDir := name == "/" || name == "" ||
		(len(name) > 0 && name[len(name)-1] == '/') ||
		isCommonDirectoryName(name)

	return &fakeFileInfo{name: name, isDir: isDir}, nil
}

// isCommonDirectoryName checks if path looks like a directory
// Common patterns: no extension, or known directory names
func isCommonDirectoryName(path string) bool {
	// Remove leading slash
	if len(path) > 0 && path[0] == '/' {
		path = path[1:]
	}

	// Common directory names (case-insensitive)
	commonDirs := []string{"iPhone", "Android", "Camera", "DCIM", "Photos",
		"Pictures", "uploads", "tmp", "temp", "data"}

	pathLower := path
	for _, dir := range commonDirs {
		if pathLower == dir || pathLower == dir+"/" {
			return true
		}
	}

	// No file extension = probably a directory
	// Files usually have extensions like .jpg, .png, etc.
	hasExtension := false
	for i := len(path) - 1; i >= 0 && i > len(path)-6; i-- {
		if path[i] == '.' {
			hasExtension = true
			break
		}
		if path[i] == '/' {
			break
		}
	}

	return !hasExtension
}

// RemoveAll accepts recursive deletion but does nothing (no-op)
func (d *ClientDriver) RemoveAll(path string) error {
	return nil // Success
}

// Create is a shortcut for OpenFile with write flags
func (d *ClientDriver) Create(name string) (afero.File, error) {
	return d.OpenFile(name, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
}

// Chmod accepts permission changes but does nothing (no-op)
// Some clients set permissions after upload (e.g., 644 for files)
func (d *ClientDriver) Chmod(name string, mode os.FileMode) error {
	return nil // Success (200 OK in FTP)
}

// Chown accepts ownership changes but does nothing (no-op)
func (d *ClientDriver) Chown(name string, uid, gid int) error {
	return nil // Success
}

// Chtimes accepts timestamp changes but does nothing (no-op)
// Clients often preserve original file timestamps (MFMT command)
func (d *ClientDriver) Chtimes(name string, atime time.Time, mtime time.Time) error {
	return nil // Success (213 Modified in FTP)
}

// ReadDir returns empty list for camera compatibility
// Some cameras issue LIST commands before uploading
func (d *ClientDriver) ReadDir(dirname string) ([]os.FileInfo, error) {
	// Return empty list to avoid breaking LIST commands
	return []os.FileInfo{}, nil
}

// fakeFileInfo is a minimal os.FileInfo implementation for camera compatibility
type fakeFileInfo struct {
	name  string
	isDir bool
}

func (fi *fakeFileInfo) Name() string { return fi.name }
func (fi *fakeFileInfo) Size() int64  { return 0 }
func (fi *fakeFileInfo) Mode() os.FileMode {
	if fi.isDir {
		return os.ModeDir | 0755
	}
	return 0644
}
func (fi *fakeFileInfo) ModTime() time.Time { return time.Now() }
func (fi *fakeFileInfo) IsDir() bool        { return fi.isDir }
func (fi *fakeFileInfo) Sys() interface{}   { return nil }

// Additional methods to satisfy afero.Fs interface

// Lstat is like Stat but doesn't follow symlinks
func (d *ClientDriver) Lstat(name string) (os.FileInfo, error) {
	return d.Stat(name)
}

// Symlink accepts symlink creation but does nothing (no-op)
func (d *ClientDriver) Symlink(oldname, newname string) error {
	return nil // Success
}

// Readlink returns empty string for symlinks (no actual symlinks exist)
func (d *ClientDriver) Readlink(name string) (string, error) {
	return "", nil // Success, but no symlink target
}

// mapPresignError maps presign API errors to FTP errors
func mapPresignError(err error, resp *http.Response) error {
	if resp == nil {
		return fmt.Errorf("presign request failed: %w", err)
	}

	switch resp.StatusCode {
	case 401:
		// JWT expired - return auth error
		return fmt.Errorf("authentication expired")
	case 402:
		return fmt.Errorf("insufficient credits")
	case 410:
		return fmt.Errorf("event expired")
	case 429:
		// All retries exhausted
		return fmt.Errorf("rate limited, please retry later")
	case 500, 502, 503:
		return fmt.Errorf("temporary server error, please retry")
	default:
		return fmt.Errorf("upload failed: %d", resp.StatusCode)
	}
}

// parseRetryAfter parses the Retry-After header from HTTP response
// Returns the duration to wait, or 0 if header is not present or invalid
func parseRetryAfter(resp *http.Response) time.Duration {
	if resp == nil {
		return 0
	}

	retryAfter := resp.Header.Get("Retry-After")
	if retryAfter == "" {
		return 0
	}

	// Try parsing as seconds (integer)
	if seconds, err := strconv.Atoi(retryAfter); err == nil {
		return time.Duration(seconds) * time.Second
	}

	// Try parsing as HTTP date (not commonly used, but spec allows it)
	// We'll skip this for simplicity - just return 0
	return 0
}
