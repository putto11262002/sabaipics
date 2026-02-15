package transfer

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
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

// UploadTransfer implements the afero.File interface for buffering uploads
// Buffers to disk to determine Content-Length before uploading to R2.
// LIFETIME CONTRACT: 1:1 with uploadTransaction. Must not be reused after Close().
type UploadTransfer struct {
	ctx               context.Context
	eventID           string
	jwtToken          string
	clientIP          string
	filename          string
	contentType       string
	clientID          uint32 // Client ID for event reporting
	clientMgr         *clientmgr.Manager
	apiClient         apiclient.APIClient
	tempFile          *os.File
	tempPath          string
	bytesWritten      atomic.Int64
	startTime         time.Time
	uploadTransaction *sentry.Span // Sentry ROOT transaction for this upload (1:1 lifetime)
}

// NewUploadTransfer creates a new upload transfer that buffers to disk
func NewUploadTransfer(ctx context.Context, eventID, jwtToken, clientIP, filename, contentType string, clientID uint32, clientMgr *clientmgr.Manager, apiClient apiclient.APIClient) (*UploadTransfer, error) {
	tempFile, err := os.CreateTemp("", "sabaipics-ftp-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp file: %w", err)
	}

	if ctx == nil {
		ctx = context.Background()
	}
	uploadTransaction := sentry.StartTransaction(ctx,
		"ftp.upload",
		sentry.WithTransactionSource(sentry.SourceCustom),
	)

	uploadTransaction.SetTag("file.name", filename)
	uploadTransaction.SetTag("event.id", eventID)
	uploadTransaction.SetTag("client.ip", clientIP)

	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), ".")
	if ext != "" {
		uploadTransaction.SetTag("file.extension", ext)
		fileType := categorizeFileType(ext)
		if fileType != "" {
			uploadTransaction.SetTag("file.type", fileType)
		}
	}

	transfer := &UploadTransfer{
		ctx:               ctx,
		eventID:           eventID,
		jwtToken:          jwtToken,
		clientIP:          clientIP,
		filename:          filename,
		contentType:       contentType,
		clientID:          clientID,
		clientMgr:         clientMgr,
		apiClient:         apiClient,
		tempFile:          tempFile,
		tempPath:          tempFile.Name(),
		startTime:         time.Now(),
		uploadTransaction: uploadTransaction,
	}

	sentry.NewLogger(uploadTransaction.Context()).Info().Emitf("Upload started: file=%s, event=%s, client=%s",
		filename, eventID, clientIP)

	return transfer, nil
}

// Write implements io.Writer - receives data from FTP client
func (t *UploadTransfer) Write(p []byte) (int, error) {
	n, err := t.tempFile.Write(p)
	t.bytesWritten.Add(int64(n))
	return n, err
}

// Close uploads the buffered file to R2
func (t *UploadTransfer) Close() error {
	if err := t.tempFile.Close(); err != nil {
		if t.uploadTransaction != nil {
			t.uploadTransaction.Status = sentry.SpanStatusInternalError
			t.uploadTransaction.SetTag("error", "true")
			t.uploadTransaction.SetData("error.message", err.Error())
			t.uploadTransaction.Finish()
		}
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("Temp file close error: file=%s, error=%v", t.filename, err)
		return err
	}

	defer os.Remove(t.tempPath)

	fileSize := t.bytesWritten.Load()
	if fileSize < 0 {
		fileSize = 0
	}

	uploadErr := t.uploadBufferedFile(fileSize)

	duration := time.Since(t.startTime)
	bytesTotal := t.bytesWritten.Load()
	throughputMBps := float64(bytesTotal) / duration.Seconds() / 1024 / 1024

	if t.uploadTransaction != nil {
		t.uploadTransaction.SetData("upload.bytes", bytesTotal)
		t.uploadTransaction.SetData("upload.duration_ms", duration.Milliseconds())
		t.uploadTransaction.SetData("upload.throughput_mbps", throughputMBps)

		if uploadErr != nil {
			t.uploadTransaction.Status = sentry.SpanStatusInternalError
			t.uploadTransaction.SetTag("error", "true")
			t.uploadTransaction.SetData("error.message", uploadErr.Error())
		} else {
			t.uploadTransaction.Status = sentry.SpanStatusOK
		}

		t.uploadTransaction.Finish()
	}

	if uploadErr != nil {
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("Upload failed: file=%s, bytes=%d, error=%v", t.filename, bytesTotal, uploadErr)
	} else {
		sentry.NewLogger(t.uploadTransaction.Context()).Info().Emitf("Upload completed: file=%s, bytes=%d, duration=%s, throughput=%.2f MB/s",
			t.filename, bytesTotal, duration, throughputMBps)
	}

	return uploadErr
}

func (t *UploadTransfer) uploadBufferedFile(fileSize int64) error {
	ctx := context.Background()

	if err := t.presignAndUpload(ctx, fileSize); err != nil {
		safeErr := sanitizeUploadError(err)
		log.Printf("R2 upload failed for file=%s: %s", t.filename, safeErr)
		sentry.NewLogger(t.uploadTransaction.Context()).Error().Emitf("R2 upload failed for file=%s: %s", t.filename, safeErr)

		if errors.Is(err, apiclient.ErrUnauthorized) {
			t.clientMgr.SendEvent(clientmgr.ClientEvent{
				Type:     clientmgr.EventAuthExpired,
				ClientID: t.clientID,
				Reason:   "authentication expired",
			})
		}

		t.clientMgr.SendEvent(clientmgr.ClientEvent{
			Type:     clientmgr.EventUploadFailed,
			ClientID: t.clientID,
			Reason:   safeErr,
		})

		return fmt.Errorf("upload failed: %s", safeErr)
	}

	sentry.NewLogger(t.uploadTransaction.Context()).Info().Emitf("Upload successful: file=%s", t.filename)
	return nil
}

func (t *UploadTransfer) presignAndUpload(ctx context.Context, fileSize int64) error {
	contentLength := fileSize
	if contentLength < 0 {
		contentLength = 0
	}

	presignCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	presignResp, err := t.apiClient.PresignWithRetry(
		presignCtx,
		t.jwtToken,
		t.filename,
		t.contentType,
		&contentLength,
		nil,
	)
	cancel()
	if err != nil {
		return err
	}

	if presignResp == nil || presignResp.PutURL == "" {
		return fmt.Errorf("presign response missing put_url")
	}

	file, err := os.Open(t.tempPath)
	if err != nil {
		return fmt.Errorf("failed to open temp file: %w", err)
	}
	defer file.Close()

	requiredHeaders := presignResp.RequiredHeaders
	if requiredHeaders == nil {
		requiredHeaders = map[string]string{}
	}

	requiredHeaders["Content-Length"] = fmt.Sprintf("%d", contentLength)
	if _, ok := requiredHeaders["Content-Type"]; !ok {
		requiredHeaders["Content-Type"] = t.contentType
	}
	if _, ok := requiredHeaders["If-None-Match"]; !ok {
		requiredHeaders["If-None-Match"] = "*"
	}

	uploadCtx, uploadCancel := context.WithTimeout(ctx, 30*time.Minute)
	resp, err := t.apiClient.UploadToPresignedURL(
		uploadCtx,
		presignResp.PutURL,
		requiredHeaders,
		file,
	)
	uploadCancel()
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("R2 upload failed: %d", resp.StatusCode)
	}

	return nil
}

func sanitizeUploadError(err error) string {
	if err == nil {
		return ""
	}

	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		if urlErr.Err != nil {
			return urlErr.Err.Error()
		}
		return "upload failed"
	}

	return err.Error()
}

// Read is not supported (upload-only)
func (t *UploadTransfer) Read(p []byte) (int, error) {
	return 0, errors.New("read not supported - upload only")
}

// ReadAt is not supported
func (t *UploadTransfer) ReadAt(p []byte, off int64) (int, error) {
	return 0, errors.New("read not supported - upload only")
}

// Seek is not supported
func (t *UploadTransfer) Seek(offset int64, whence int) (int64, error) {
	return 0, errors.New("seek not supported - upload only")
}

// WriteAt is not supported
func (t *UploadTransfer) WriteAt(p []byte, off int64) (int, error) {
	return 0, errors.New("WriteAt not supported - upload only")
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

// Sync is a no-op for buffered uploads
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
	case "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif":
		return "image"
	case "cr2", "cr3", "nef", "arw", "orf", "rw2", "dng", "raf", "raw":
		return "raw"
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
