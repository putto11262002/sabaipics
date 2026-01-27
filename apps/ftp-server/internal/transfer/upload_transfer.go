package transfer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/clientmgr"
)

// ErrAuthExpired indicates that the JWT token has expired (401 from API)
// ClientManager hub will handle disconnection when this error is reported
var ErrAuthExpired = errors.New("authentication expired")

// UploadTransfer implements the afero.File interface for streaming uploads
// Uses io.Pipe to stream data to R2 via presigned URL without buffering to disk
// LIFETIME CONTRACT: 1:1 with uploadTransaction. Must not be reused after Close().
type UploadTransfer struct {
	eventID           string
	jwtToken          string
	clientIP          string
	filename          string
	presignedURL      string
	requiredHeaders   map[string]string
	clientID          uint32 // Client ID for event reporting
	clientMgr         *clientmgr.Manager
	apiClient         apiclient.APIClient
	pipeReader        *io.PipeReader
	pipeWriter        *io.PipeWriter
	uploadDone        chan error
	bytesWritten      atomic.Int64
	startTime         time.Time
	uploadTransaction *sentry.Span // Sentry ROOT transaction for this upload (1:1 lifetime)
}

// NewUploadTransfer creates a new upload transfer for streaming to R2 via presigned URL
// Creates a ROOT Sentry transaction for this upload (not a child span)
func NewUploadTransfer(eventID, jwtToken, clientIP, filename, presignedURL string, requiredHeaders map[string]string, clientID uint32, clientMgr *clientmgr.Manager, apiClient apiclient.APIClient) *UploadTransfer {
	pr, pw := io.Pipe()

	// Create ROOT Sentry transaction for this upload
	ctx := context.Background()
	uploadTransaction := sentry.StartTransaction(ctx,
		"ftp.upload",
		sentry.WithTransactionSource(sentry.SourceCustom),
	)

	// Add comprehensive tags for filtering and analysis
	uploadTransaction.SetTag("file.name", filename)
	uploadTransaction.SetTag("event.id", eventID)
	uploadTransaction.SetTag("client.ip", clientIP)

	// Extract and tag file extension (e.g., "jpg", "png", "cr2")
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), ".")
	if ext != "" {
		uploadTransaction.SetTag("file.extension", ext)
		// Categorize file type based on extension
		fileType := categorizeFileType(ext)
		if fileType != "" {
			uploadTransaction.SetTag("file.type", fileType)
		}
	}

	transfer := &UploadTransfer{
		eventID:           eventID,
		jwtToken:          jwtToken,
		clientIP:          clientIP,
		filename:          filename,
		presignedURL:      presignedURL,
		requiredHeaders:   requiredHeaders,
		clientID:          clientID,
		clientMgr:         clientMgr,
		apiClient:         apiClient,
		pipeReader:        pr,
		pipeWriter:        pw,
		uploadDone:        make(chan error, 1),
		startTime:         time.Now(),
		uploadTransaction: uploadTransaction,
	}

	// Start background goroutine to stream to R2
	go transfer.streamToR2()

	// Log upload creation at I/O boundary
	sentry.NewLogger(uploadTransaction.Context()).Info().Emitf("Upload started: file=%s, event=%s, client=%s",
		filename, eventID, clientIP)

	return transfer
}

// Write implements io.Writer - receives data from FTP client
// No logging - too verbose for per-chunk operations
func (t *UploadTransfer) Write(p []byte) (int, error) {
	n, err := t.pipeWriter.Write(p)
	t.bytesWritten.Add(int64(n))
	return n, err
}

// Close signals EOF and waits for upload completion at I/O boundary
func (t *UploadTransfer) Close() error {
	// Signal EOF to the pipe reader
	if err := t.pipeWriter.Close(); err != nil {
		if t.uploadTransaction != nil {
			t.uploadTransaction.Status = sentry.SpanStatusInternalError
			t.uploadTransaction.SetTag("error", "true")
			t.uploadTransaction.SetData("error.message", err.Error())
			t.uploadTransaction.Finish()
		}
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("Pipe close error: file=%s, error=%v", t.filename, err)
		return err
	}

	// Wait for background upload to complete
	err := <-t.uploadDone

	duration := time.Since(t.startTime)
	bytesTotal := t.bytesWritten.Load()
	throughputMBps := float64(bytesTotal) / duration.Seconds() / 1024 / 1024

	// Add metrics to Sentry transaction
	if t.uploadTransaction != nil {
		t.uploadTransaction.SetData("upload.bytes", bytesTotal)
		t.uploadTransaction.SetData("upload.duration_ms", duration.Milliseconds())
		t.uploadTransaction.SetData("upload.throughput_mbps", throughputMBps)

		if err != nil {
			t.uploadTransaction.Status = sentry.SpanStatusInternalError
			t.uploadTransaction.SetTag("error", "true")
			t.uploadTransaction.SetData("error.message", err.Error())
		} else {
			t.uploadTransaction.Status = sentry.SpanStatusOK
		}

		t.uploadTransaction.Finish()
	}

	// Log at I/O boundary
	if err != nil {
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("Upload failed: file=%s, bytes=%d, error=%v", t.filename, bytesTotal, err)
	} else {
		sentry.NewLogger(t.uploadTransaction.Context()).Info().Emitf("Upload completed: file=%s, bytes=%d, duration=%s, throughput=%.2f MB/s",
			t.filename, bytesTotal, duration, throughputMBps)
	}

	return err
}

// streamToR2 runs in a background goroutine to stream data to R2 via presigned URL (I/O boundary)
func (t *UploadTransfer) streamToR2() {
	defer close(t.uploadDone)

	ctx := t.uploadTransaction.Context()

	// Upload to R2 presigned URL
	resp, err := t.apiClient.UploadToPresignedURL(
		ctx,
		t.presignedURL,
		t.requiredHeaders,
		t.pipeReader, // Stream directly from FTP client pipe
	)

	if err != nil {
		// Network error during transfer
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("R2 upload failed for file=%s: %v", t.filename, err)

		t.clientMgr.SendEvent(clientmgr.ClientEvent{
			Type:     clientmgr.EventUploadFailed,
			ClientID: t.clientID,
			Reason:   err.Error(),
		})

		t.uploadDone <- err
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("R2 upload failed for file=%s: status %d", t.filename, resp.StatusCode)

		t.clientMgr.SendEvent(clientmgr.ClientEvent{
			Type:     clientmgr.EventUploadFailed,
			ClientID: t.clientID,
			Reason:   fmt.Sprintf("R2 upload failed: %d", resp.StatusCode),
		})

		t.uploadDone <- fmt.Errorf("R2 upload failed: %d", resp.StatusCode)
		return
	}

	sentry.NewLogger(t.uploadTransaction.Context()).Info().Emitf("Upload successful: file=%s", t.filename)

	t.uploadDone <- nil
}

// Read is not supported (upload-only)
func (t *UploadTransfer) Read(p []byte) (int, error) {
	return 0, errors.New("read not supported - upload only")
}

// ReadAt is not supported
func (t *UploadTransfer) ReadAt(p []byte, off int64) (int, error) {
	return 0, errors.New("read not supported - upload only")
}

// Seek is not supported (streaming upload)
func (t *UploadTransfer) Seek(offset int64, whence int) (int64, error) {
	return 0, errors.New("seek not supported - streaming upload")
}

// WriteAt is not supported (streaming upload)
func (t *UploadTransfer) WriteAt(p []byte, off int64) (int, error) {
	return 0, errors.New("WriteAt not supported - streaming upload")
}

// Name returns the filename
func (t *UploadTransfer) Name() string {
	return t.filename
}

// Readdir is not supported
func (t *UploadTransfer) Readdir(count int) ([]os.FileInfo, error) {
	return nil, errors.New("readdir not supported")
}

// Readdirnames is not supported
func (t *UploadTransfer) Readdirnames(n int) ([]string, error) {
	return nil, errors.New("readdirnames not supported")
}

// Stat returns fake file info
func (t *UploadTransfer) Stat() (os.FileInfo, error) {
	return &fakeFileInfo{
		name: t.filename,
		size: t.bytesWritten.Load(),
	}, nil
}

// Sync is a no-op for streaming uploads
func (t *UploadTransfer) Sync() error {
	return nil
}

// Truncate is not supported
func (t *UploadTransfer) Truncate(size int64) error {
	return errors.New("truncate not supported")
}

// WriteString is a helper that writes a string
func (t *UploadTransfer) WriteString(s string) (int, error) {
	return t.Write([]byte(s))
}

// categorizeFileType returns the file type category based on extension
func categorizeFileType(ext string) string {
	switch ext {
	// Standard image formats
	case "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif":
		return "image"
	// RAW camera formats
	case "cr2", "cr3", "nef", "arw", "orf", "rw2", "dng", "raf", "raw":
		return "raw"
	// Video formats (unlikely but possible)
	case "mp4", "mov", "avi", "mkv":
		return "video"
	default:
		return "unknown"
	}
}

// fakeFileInfo implements os.FileInfo for Stat()
type fakeFileInfo struct {
	name string
	size int64
}

func (fi *fakeFileInfo) Name() string       { return fi.name }
func (fi *fakeFileInfo) Size() int64        { return fi.size }
func (fi *fakeFileInfo) Mode() os.FileMode  { return 0644 }
func (fi *fakeFileInfo) ModTime() time.Time { return time.Now() }
func (fi *fakeFileInfo) IsDir() bool        { return false }
func (fi *fakeFileInfo) Sys() interface{}   { return nil }
