package client

import (
	"context"
	"os"
	"time"

	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/transfer"
	"github.com/spf13/afero"
)

// ClientDriver implements ftpserverlib.ClientDriver interface (afero.Fs)
// This driver enforces upload-only operations without logging (returns error sentinels)
// Logging is the responsibility of MainDriver at application boundaries
type ClientDriver struct {
	eventID        string
	photographerID string
	config         *config.Config
	parentCtx      context.Context // Parent context for span propagation to UploadTransfer
}

// NewClientDriver creates a new ClientDriver instance
func NewClientDriver(eventID, photographerID string, cfg *config.Config, parentCtx context.Context) *ClientDriver {
	return &ClientDriver{
		eventID:        eventID,
		photographerID: photographerID,
		config:         cfg,
		parentCtx:      parentCtx,
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

	// Create UploadTransfer for streaming upload to R2, passing parent context
	uploadTransfer := transfer.NewUploadTransfer(d.eventID, name, d.parentCtx)
	return uploadTransfer, nil
}

// Open blocks file reading (RETR command)
func (d *ClientDriver) Open(name string) (afero.File, error) {
	return nil, ErrDownloadNotAllowed
}

// Remove blocks file deletion (DELE command)
func (d *ClientDriver) Remove(name string) error {
	return ErrDeleteNotAllowed
}

// Rename blocks file renaming (RNFR/RNTO commands)
func (d *ClientDriver) Rename(oldname, newname string) error {
	return ErrRenameNotAllowed
}

// Mkdir blocks directory creation
func (d *ClientDriver) Mkdir(name string, perm os.FileMode) error {
	return ErrMkdirNotAllowed
}

// MkdirAll blocks directory creation
func (d *ClientDriver) MkdirAll(path string, perm os.FileMode) error {
	return ErrMkdirNotAllowed
}

// Stat returns fake file info for camera compatibility
// Some cameras check file existence before uploading
func (d *ClientDriver) Stat(name string) (os.FileInfo, error) {
	return &fakeFileInfo{name: name}, nil
}

// RemoveAll blocks recursive deletion
func (d *ClientDriver) RemoveAll(path string) error {
	return ErrDeleteNotAllowed
}

// Create is a shortcut for OpenFile with write flags
func (d *ClientDriver) Create(name string) (afero.File, error) {
	return d.OpenFile(name, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
}

// Chmod blocks permission changes
func (d *ClientDriver) Chmod(name string, mode os.FileMode) error {
	return ErrChmodNotAllowed
}

// Chown blocks ownership changes
func (d *ClientDriver) Chown(name string, uid, gid int) error {
	return ErrChownNotAllowed
}

// Chtimes blocks timestamp changes
func (d *ClientDriver) Chtimes(name string, atime time.Time, mtime time.Time) error {
	return ErrChtimesNotAllowed
}

// ReadDir returns empty list for camera compatibility
// Some cameras issue LIST commands before uploading
func (d *ClientDriver) ReadDir(dirname string) ([]os.FileInfo, error) {
	// Return empty list to avoid breaking LIST commands
	return []os.FileInfo{}, nil
}

// fakeFileInfo is a minimal os.FileInfo implementation for camera compatibility
type fakeFileInfo struct {
	name string
}

func (fi *fakeFileInfo) Name() string       { return fi.name }
func (fi *fakeFileInfo) Size() int64        { return 0 }
func (fi *fakeFileInfo) Mode() os.FileMode  { return 0644 }
func (fi *fakeFileInfo) ModTime() time.Time { return time.Now() }
func (fi *fakeFileInfo) IsDir() bool        { return false }
func (fi *fakeFileInfo) Sys() interface{}   { return nil }

// Additional methods to satisfy afero.Fs interface

// Lstat is like Stat but doesn't follow symlinks
func (d *ClientDriver) Lstat(name string) (os.FileInfo, error) {
	return d.Stat(name)
}

// Symlink blocks symlink creation
func (d *ClientDriver) Symlink(oldname, newname string) error {
	return ErrSymlinkNotAllowed
}

// Readlink blocks symlink reading
func (d *ClientDriver) Readlink(name string) (string, error) {
	return "", ErrReadlinkNotAllowed
}
