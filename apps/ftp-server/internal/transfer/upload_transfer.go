package transfer

import (
	"context"
	"errors"
	"io"
	"os"
	"sync/atomic"
	"time"

	"github.com/getsentry/sentry-go"
)

// UploadTransfer implements the afero.File interface for streaming uploads
// Uses io.Pipe to stream data directly to R2 without buffering to disk
// LIFETIME CONTRACT: 1:1 with uploadSpan. Must not be reused after Close().
type UploadTransfer struct {
	eventID      string
	filename     string
	pipeReader   *io.PipeReader
	pipeWriter   *io.PipeWriter
	uploadDone   chan error
	bytesWritten atomic.Int64
	startTime    time.Time
	uploadSpan   *sentry.Span // Sentry span for upload tracking (1:1 lifetime)
}

// log returns a Sentry logger bound to the upload span context
func (t *UploadTransfer) log() sentry.Logger {
	if t.uploadSpan != nil {
		return sentry.NewLogger(t.uploadSpan.Context())
	}
	return sentry.NewLogger(context.Background())
}

// NewUploadTransfer creates a new upload transfer for streaming to R2
func NewUploadTransfer(eventID, filename string, parentCtx context.Context) *UploadTransfer {
	pr, pw := io.Pipe()

	// Create child Sentry span from parent context
	uploadSpan := sentry.StartSpan(parentCtx, "ftp.upload")
	uploadSpan.SetTag("file.name", filename)
	uploadSpan.SetTag("event.id", eventID)

	transfer := &UploadTransfer{
		eventID:    eventID,
		filename:   filename,
		pipeReader: pr,
		pipeWriter: pw,
		uploadDone: make(chan error, 1),
		startTime:  time.Now(),
		uploadSpan: uploadSpan,
	}

	// Start background goroutine to stream to R2
	go transfer.streamToR2()

	// Log upload creation at I/O boundary
	transfer.log().Info().Emitf("Upload started: file=%s, event=%s", filename, eventID)

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
		if t.uploadSpan != nil {
			t.uploadSpan.SetTag("error", "true")
			t.uploadSpan.SetData("error.message", err.Error())
			t.uploadSpan.Finish()
		}
		t.log().Error().Emitf("Pipe close error: file=%s, error=%v", t.filename, err)
		return err
	}

	// Wait for background upload to complete
	err := <-t.uploadDone

	duration := time.Since(t.startTime)
	bytesTotal := t.bytesWritten.Load()
	throughputMBps := float64(bytesTotal) / duration.Seconds() / 1024 / 1024

	// Add metrics to Sentry span
	if t.uploadSpan != nil {
		t.uploadSpan.SetData("upload.bytes", bytesTotal)
		t.uploadSpan.SetData("upload.duration_ms", duration.Milliseconds())
		t.uploadSpan.SetData("upload.throughput_mbps", throughputMBps)

		if err != nil {
			t.uploadSpan.SetTag("error", "true")
			t.uploadSpan.SetData("error.message", err.Error())
		}

		t.uploadSpan.Finish()
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

// streamToR2 runs in a background goroutine to stream data to R2 (I/O boundary)
// STUB: Just reads and discards data, logs would-be upload progress
func (t *UploadTransfer) streamToR2() {
	defer close(t.uploadDone)

	// Log background goroutine start
	t.log().Debug().Emitf("STUB: Background upload started for file=%s", t.filename)

	// STUB: In real implementation, we would:
	// 1. Create S3/R2 client with credentials
	// 2. Start multipart upload or single PUT
	// 3. Stream from pipeReader directly to R2
	// 4. Handle errors and retry logic
	// 5. Store metadata (event_id, photographer_id, upload_time)
	// 6. Propagate Sentry traceparent to R2 metadata

	// For now, just read and discard data to simulate upload
	buffer := make([]byte, 32*1024) // 32KB buffer
	totalRead := int64(0)

	for {
		n, err := t.pipeReader.Read(buffer)
		if n > 0 {
			totalRead += int64(n)
			// No logging per chunk - too verbose
		}

		if err == io.EOF {
			t.log().Info().Emitf("STUB: R2 upload stream complete for file=%s (total: %d bytes)", t.filename, totalRead)
			t.uploadDone <- nil
			return
		}

		if err != nil {
			t.log().Error().Emitf("STUB: R2 upload stream error for file=%s: %v", t.filename, err)
			t.uploadDone <- err
			return
		}
	}
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
