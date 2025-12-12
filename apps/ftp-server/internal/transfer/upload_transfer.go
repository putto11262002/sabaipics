package transfer

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	ftpserver "github.com/fclairamb/ftpserverlib"
	"github.com/getsentry/sentry-go"
	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/apiclient"
)

// ErrAuthExpired indicates that the JWT token has expired (401 from API)
// MainDriver should disconnect the client when this error is encountered
var ErrAuthExpired = errors.New("authentication expired")

// UploadTransfer implements the afero.File interface for streaming uploads
// Uses io.Pipe to stream data to API via FormData without buffering to disk
// LIFETIME CONTRACT: 1:1 with uploadTransaction. Must not be reused after Close().
type UploadTransfer struct {
	eventID           string
	jwtToken          string
	clientIP          string
	filename          string
	clientContext     ftpserver.ClientContext // For disconnecting on auth expiry
	apiClient         *apiclient.Client
	pipeReader        *io.PipeReader
	pipeWriter        *io.PipeWriter
	uploadDone        chan error
	bytesWritten      atomic.Int64
	startTime         time.Time
	uploadTransaction *sentry.Span // Sentry ROOT transaction for this upload (1:1 lifetime)
}

// log returns a Sentry logger bound to the upload transaction context
func (t *UploadTransfer) log() sentry.Logger {
	if t.uploadTransaction != nil {
		return sentry.NewLogger(t.uploadTransaction.Context())
	}
	return sentry.NewLogger(context.Background())
}

// NewUploadTransfer creates a new upload transfer for streaming to API via FormData
// Creates a ROOT Sentry transaction for this upload (not a child span)
func NewUploadTransfer(eventID, jwtToken, clientIP, filename string, cc ftpserver.ClientContext, apiClient *apiclient.Client) *UploadTransfer {
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

	transfer := &UploadTransfer{
		eventID:           eventID,
		jwtToken:          jwtToken,
		clientIP:          clientIP,
		filename:          filename,
		clientContext:     cc,
		apiClient:         apiClient,
		pipeReader:        pr,
		pipeWriter:        pw,
		uploadDone:        make(chan error, 1),
		startTime:         time.Now(),
		uploadTransaction: uploadTransaction,
	}

	// Start background goroutine to stream to API
	go transfer.streamToAPI()

	// Log upload creation at I/O boundary
	transfer.log().Info().Emitf("Upload started: file=%s, event=%s, client=%s",
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
		t.log().Error().Emitf("Pipe close error: file=%s, error=%v", t.filename, err)
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
		t.log().Error().Emitf("Upload failed: file=%s, bytes=%d, error=%v", t.filename, bytesTotal, err)
	} else {
		t.log().Info().Emitf("Upload completed: file=%s, bytes=%d, duration=%s, throughput=%.2f MB/s",
			t.filename, bytesTotal, duration, throughputMBps)
	}

	return err
}

// streamToAPI runs in a background goroutine to stream data to API via FormData (I/O boundary)
func (t *UploadTransfer) streamToAPI() {
	defer close(t.uploadDone)

	ctx := t.uploadTransaction.Context()

	// Upload via FormData to API
	uploadResp, httpResp, err := t.apiClient.UploadFormData(
		ctx,
		t.jwtToken,
		t.eventID,
		t.filename,
		t.pipeReader, // Stream directly from FTP client pipe
	)

	if err != nil {
		// Check for 401 (token expired)
		if httpResp != nil && httpResp.StatusCode == http.StatusUnauthorized {
			t.log().Error().Emitf("Auth expired for file=%s, disconnecting client", t.filename)

			// Disconnect the client using ClientContext.Close()
			if t.clientContext != nil {
				if closeErr := t.clientContext.Close(); closeErr != nil {
					t.log().Error().Emitf("Failed to disconnect client: %v", closeErr)
				}
			}

			t.uploadDone <- ErrAuthExpired
			return
		}

		t.log().Error().Emitf("API upload failed for file=%s: %v", t.filename, err)
		t.uploadDone <- err
		return
	}

	t.log().Info().Emitf("Upload successful: file=%s, photo_id=%s, size=%d bytes",
		t.filename, uploadResp.Data.ID, uploadResp.Data.SizeBytes)

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
