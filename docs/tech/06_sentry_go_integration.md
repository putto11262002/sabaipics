# Sentry Go SDK Integration Guide

## Overview

This guide covers integrating Sentry's Go SDK (`github.com/getsentry/sentry-go`) into the SabaiPics FTP server for comprehensive error tracking and distributed tracing.

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Error Tracking](#error-tracking)
3. [Performance Monitoring & Distributed Tracing](#performance-monitoring--distributed-tracing)
4. [Trace Propagation](#trace-propagation)
5. [SFTPGo Integration Patterns](#sftpgo-integration-patterns)
6. [Code Examples](#code-examples)

## Installation & Setup

### Package Installation

```bash
go get github.com/getsentry/sentry-go@latest
```

### Basic Initialization

Initialize Sentry as early as possible in your application lifecycle:

```go
package main

import (
    "log"
    "time"

    "github.com/getsentry/sentry-go"
)

func main() {
    err := sentry.Init(sentry.ClientOptions{
        Dsn: "YOUR_SENTRY_DSN",

        // Enable debug mode for development
        Debug: true,

        // Set environment (production, staging, development)
        Environment: "production",

        // Release tracking (use build-time variable)
        Release: "sabaipics-ftp@1.0.0",

        // Server name
        ServerName: "ftp-server-01",

        // Enable performance tracing
        EnableTracing: true,

        // Sample 100% of traces in development, adjust for production
        TracesSampleRate: 1.0,

        // Send user data (IP addresses, request headers)
        SendDefaultPII: true,

        // Configure which HTTP status codes to ignore
        TraceIgnoreStatusCodes: [][]int{
            {404},        // Ignore 404s
            {400, 405},   // Ignore range 400-405
        },
    })

    if err != nil {
        log.Fatalf("sentry.Init: %s", err)
    }

    // Flush buffered events before terminating
    defer sentry.Flush(2 * time.Second)

    // Your application code...
}
```

### Environment Variables

Alternatively, use environment variables:

```bash
export SENTRY_DSN="YOUR_SENTRY_DSN"
export SENTRY_ENVIRONMENT="production"
export SENTRY_RELEASE="sabaipics-ftp@1.0.0"
```

Then initialize with minimal config:

```go
err := sentry.Init(sentry.ClientOptions{
    EnableTracing: true,
    TracesSampleRate: 1.0,
})
```

## Error Tracking

### Capturing Errors

#### Simple Error Capture

```go
if err != nil {
    sentry.CaptureException(err)
    return err
}
```

#### Error with Context

```go
if err != nil {
    sentry.WithScope(func(scope *sentry.Scope) {
        scope.SetTag("operation", "file_upload")
        scope.SetTag("user_id", userID)
        scope.SetExtra("file_size", fileSize)
        scope.SetExtra("file_path", filePath)
        scope.SetContext("upload", map[string]interface{}{
            "bucket":    "sabaipics-uploads",
            "mime_type": mimeType,
        })
        sentry.CaptureException(err)
    })
    return err
}
```

### Panic Recovery

```go
func handleRequest() {
    defer sentry.Recover()

    // Your code that might panic
    processUpload()
}
```

#### Panic Recovery with Context

```go
func handleRequest(ctx context.Context) {
    defer sentry.RecoverWithContext(ctx)

    // Your code...
}
```

### Capturing Messages

```go
// Info level message
sentry.CaptureMessage("FTP server started successfully")

// With scope and level
sentry.WithScope(func(scope *sentry.Scope) {
    scope.SetLevel(sentry.LevelWarning)
    scope.SetTag("component", "auth")
    sentry.CaptureMessage("Multiple failed login attempts detected")
})
```

### Setting User Context

```go
sentry.ConfigureScope(func(scope *sentry.Scope) {
    scope.SetUser(sentry.User{
        ID:       userID,
        Email:    userEmail,
        Username: username,
        IPAddress: clientIP,
    })
})
```

### Breadcrumbs

Track the sequence of events leading to an error:

```go
sentry.AddBreadcrumb(&sentry.Breadcrumb{
    Type:     "default",
    Category: "auth",
    Message:  "User authentication started",
    Level:    sentry.LevelInfo,
    Data: map[string]interface{}{
        "username": username,
        "method":   "password",
    },
})

// Later...
sentry.AddBreadcrumb(&sentry.Breadcrumb{
    Type:     "http",
    Category: "upload",
    Message:  "File upload initiated",
    Level:    sentry.LevelInfo,
    Data: map[string]interface{}{
        "file_name": fileName,
        "file_size": fileSize,
    },
})
```

## Performance Monitoring & Distributed Tracing

### Creating Transactions

Transactions represent a single operation (like an HTTP request or file upload).

```go
import (
    "context"
    "github.com/getsentry/sentry-go"
)

func handleUpload(ctx context.Context, fileName string) error {
    // Start a transaction
    span := sentry.StartTransaction(
        ctx,
        "ftp.upload",
        sentry.WithTransactionName("/upload"),
    )
    defer span.Finish()

    // Add transaction data
    span.SetTag("file_type", filepath.Ext(fileName))
    span.SetData("file_size", fileSize)

    // Your upload logic...
    err := uploadFile(span.Context(), fileName)
    if err != nil {
        span.Status = sentry.SpanStatusInternalError
        sentry.CaptureException(err)
        return err
    }

    span.Status = sentry.SpanStatusOK
    return nil
}
```

### Creating Spans

Spans represent sub-operations within a transaction:

```go
func uploadFile(ctx context.Context, fileName string) error {
    // Start child span for validation
    validationSpan := sentry.StartSpan(ctx, "validation")
    validationSpan.Description = "Validate file"
    err := validateFile(fileName)
    validationSpan.Finish()

    if err != nil {
        return err
    }

    // Start child span for S3 upload
    s3Span := sentry.StartSpan(ctx, "s3.upload")
    s3Span.Description = fmt.Sprintf("Upload %s to S3", fileName)
    s3Span.SetData("bucket", "sabaipics-uploads")
    s3Span.SetData("key", fileName)

    err = uploadToS3(s3Span.Context(), fileName)
    if err != nil {
        s3Span.Status = sentry.SpanStatusInternalError
        s3Span.Finish()
        return err
    }

    s3Span.Status = sentry.SpanStatusOK
    s3Span.Finish()

    return nil
}
```

### Nested Spans

```go
func processUpload(ctx context.Context, file File) error {
    span := sentry.StartSpan(ctx, "process_upload")
    defer span.Finish()

    // Child span 1: Virus scan
    virusScan := span.StartChild("virus.scan")
    scanResult := scanForVirus(file)
    virusScan.Finish()

    if !scanResult.Clean {
        return errors.New("virus detected")
    }

    // Child span 2: Image processing
    imageProc := span.StartChild("image.process")
    imageProc.SetData("operation", "resize")
    processedFile := resizeImage(file)
    imageProc.Finish()

    // Child span 3: Storage
    storage := span.StartChild("storage.upload")
    storage.SetData("destination", "s3")
    err := uploadToStorage(storage.Context(), processedFile)
    storage.Finish()

    return err
}
```

## Trace Propagation

### Understanding Trace Headers

Sentry uses two headers for distributed tracing:

1. **sentry-trace**: Contains trace ID, span ID, and sampling decision
   - Format: `{trace_id}-{span_id}-{sampled}`
   - Example: `4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1`

2. **baggage**: Contains dynamic sampling context
   - Format: W3C Baggage header
   - Example: `sentry-trace_id=4bf92f3577...,sentry-environment=production`

### Extracting Incoming Trace Context

For HTTP servers receiving requests with trace context:

```go
import (
    "net/http"
    "github.com/getsentry/sentry-go"
)

func handleHTTPRequest(w http.ResponseWriter, r *http.Request) {
    // Extract trace headers
    sentryTrace := r.Header.Get("sentry-trace")
    baggage := r.Header.Get("baggage")

    // Create transaction from incoming trace
    var span *sentry.Span
    if sentryTrace != "" {
        span = sentry.StartTransaction(
            r.Context(),
            "http.request",
            sentry.ContinueFromHeaders(sentryTrace, baggage),
        )
    } else {
        // Start new trace if no incoming context
        span = sentry.StartTransaction(r.Context(), "http.request")
    }
    defer span.Finish()

    // Continue processing with span context
    ctx := span.Context()
    processRequest(ctx)
}
```

### Propagating Trace to Outgoing HTTP Requests

When making HTTP calls to other services, propagate the trace context:

```go
func makeHTTPCall(ctx context.Context, url string) error {
    // Get current span from context
    span := sentry.SpanFromContext(ctx)
    if span == nil {
        // No active span, make request without tracing
        return doHTTPRequest(url, nil)
    }

    // Create child span for HTTP call
    httpSpan := span.StartChild("http.client")
    httpSpan.Description = fmt.Sprintf("GET %s", url)
    defer httpSpan.Finish()

    // Create HTTP request
    req, err := http.NewRequestWithContext(httpSpan.Context(), "GET", url, nil)
    if err != nil {
        return err
    }

    // Add Sentry trace headers
    req.Header.Set("sentry-trace", span.ToSentryTrace())
    req.Header.Set("baggage", span.ToBaggage())

    // Make request
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        httpSpan.Status = sentry.SpanStatusInternalError
        return err
    }
    defer resp.Body.Close()

    // Set span status based on response
    httpSpan.Status = sentry.HTTPtoSpanStatus(resp.StatusCode)
    httpSpan.SetData("status_code", resp.StatusCode)

    return nil
}
```

### Using Custom HTTP RoundTripper

For automatic trace propagation on all HTTP requests:

```go
type SentryRoundTripper struct {
    transport http.RoundTripper
}

func (t *SentryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
    // Get current span from request context
    span := sentry.SpanFromContext(req.Context())
    if span != nil {
        // Add trace headers
        req.Header.Set("sentry-trace", span.ToSentryTrace())
        req.Header.Set("baggage", span.ToBaggage())
    }

    // Execute request
    return t.transport.RoundTrip(req)
}

// Usage
client := &http.Client{
    Transport: &SentryRoundTripper{
        transport: http.DefaultTransport,
    },
}
```

### Hub and Context Management

For concurrent operations, use Hub:

```go
func processInGoroutine(ctx context.Context) {
    // Clone hub for goroutine
    hub := sentry.GetHubFromContext(ctx)
    if hub == nil {
        hub = sentry.CurrentHub().Clone()
    }

    go func() {
        // Use cloned hub in goroutine
        defer hub.Recover()

        hub.ConfigureScope(func(scope *sentry.Scope) {
            scope.SetTag("goroutine", "background")
        })

        // Your code...
    }()
}
```

## SFTPGo Integration Patterns

SFTPGo provides event hooks that can be integrated with Sentry for tracking file operations.

### HTTP Hook for File Operations

Configure SFTPGo to send HTTP notifications to your Sentry-instrumented service:

```json
{
  "common": {
    "actions": {
      "execute_on": ["upload", "download", "delete", "rename"],
      "hook": "http://localhost:8080/sftpgo/webhook"
    }
  }
}
```

### Webhook Handler with Sentry

```go
package main

import (
    "encoding/json"
    "net/http"
    "github.com/getsentry/sentry-go"
)

type SFTPGoEvent struct {
    Action       string `json:"action"`
    Username     string `json:"username"`
    Path         string `json:"path"`
    TargetPath   string `json:"target_path"`
    VirtualPath  string `json:"virtual_path"`
    FileSize     int64  `json:"file_size"`
    Status       int    `json:"status"`
    Protocol     string `json:"protocol"`
    IP           string `json:"ip"`
    SessionID    string `json:"session_id"`
    FSProvider   int    `json:"fs_provider"`
    Bucket       string `json:"bucket"`
    Endpoint     string `json:"endpoint"`
    Elapsed      int64  `json:"elapsed"`
}

func handleSFTPGoWebhook(w http.ResponseWriter, r *http.Request) {
    // Start transaction
    span := sentry.StartTransaction(
        r.Context(),
        "sftpgo.webhook",
        sentry.ContinueFromRequest(r),
    )
    defer span.Finish()

    // Parse webhook payload
    var event SFTPGoEvent
    if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
        span.Status = sentry.SpanStatusInvalidArgument
        sentry.CaptureException(err)
        http.Error(w, "Invalid payload", http.StatusBadRequest)
        return
    }

    // Add event context to Sentry
    span.SetTag("action", event.Action)
    span.SetTag("protocol", event.Protocol)
    span.SetData("username", event.Username)
    span.SetData("file_size", event.FileSize)
    span.SetData("elapsed_ms", event.Elapsed)

    // Set user context
    sentry.ConfigureScope(func(scope *sentry.Scope) {
        scope.SetUser(sentry.User{
            Username:  event.Username,
            IPAddress: event.IP,
        })
        scope.SetContext("sftpgo", map[string]interface{}{
            "session_id": event.SessionID,
            "fs_provider": event.FSProvider,
            "bucket":     event.Bucket,
        })
    })

    // Add breadcrumb
    sentry.AddBreadcrumb(&sentry.Breadcrumb{
        Category: "sftpgo",
        Message:  fmt.Sprintf("%s: %s", event.Action, event.Path),
        Level:    sentry.LevelInfo,
        Data: map[string]interface{}{
            "virtual_path": event.VirtualPath,
            "file_size":    event.FileSize,
        },
    })

    // Check for errors (status != 1 means error)
    if event.Status != 1 {
        span.Status = sentry.SpanStatusInternalError

        errorMsg := fmt.Sprintf("SFTPGo operation failed: %s", event.Action)
        if event.Status == 3 {
            errorMsg = fmt.Sprintf("Quota exceeded: %s", event.Action)
        }

        sentry.CaptureMessage(errorMsg)
    } else {
        span.Status = sentry.SpanStatusOK
    }

    // Process webhook (e.g., trigger face recognition)
    processingSpan := span.StartChild("process.webhook")
    err := processFileOperation(processingSpan.Context(), event)
    processingSpan.Finish()

    if err != nil {
        sentry.CaptureException(err)
        http.Error(w, "Processing failed", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}

func processFileOperation(ctx context.Context, event SFTPGoEvent) error {
    span := sentry.StartSpan(ctx, "file.operation")
    defer span.Finish()

    switch event.Action {
    case "upload":
        return handleUpload(span.Context(), event)
    case "download":
        return handleDownload(span.Context(), event)
    case "delete":
        return handleDelete(span.Context(), event)
    default:
        return nil
    }
}

func handleUpload(ctx context.Context, event SFTPGoEvent) error {
    span := sentry.StartSpan(ctx, "handle.upload")
    defer span.Finish()

    // Start face recognition
    faceSpan := span.StartChild("face.recognition")
    faceSpan.SetData("file", event.Path)

    // Make HTTP call to face recognition API with trace propagation
    err := callFaceRecognitionAPI(faceSpan.Context(), event.Path)
    faceSpan.Finish()

    if err != nil {
        faceSpan.Status = sentry.SpanStatusInternalError
        return err
    }

    faceSpan.Status = sentry.SpanStatusOK
    return nil
}

func callFaceRecognitionAPI(ctx context.Context, filePath string) error {
    span := sentry.StartSpan(ctx, "http.client")
    span.Description = "POST /api/face-recognition"
    defer span.Finish()

    // Create request
    req, err := http.NewRequestWithContext(
        span.Context(),
        "POST",
        "https://api.sabaipics.com/face-recognition",
        nil,
    )
    if err != nil {
        return err
    }

    // Propagate trace
    parentSpan := sentry.SpanFromContext(ctx)
    if parentSpan != nil {
        req.Header.Set("sentry-trace", parentSpan.ToSentryTrace())
        req.Header.Set("baggage", parentSpan.ToBaggage())
    }

    // Make request
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        span.Status = sentry.SpanStatusInternalError
        return err
    }
    defer resp.Body.Close()

    span.Status = sentry.HTTPtoSpanStatus(resp.StatusCode)
    span.SetData("status_code", resp.StatusCode)

    return nil
}
```

### Custom Logger Integration

Integrate Sentry with Go's standard logger:

```go
package main

import (
    "context"
    "log"

    "github.com/getsentry/sentry-go"
)

type SentryLogger struct {
    ctx context.Context
}

func NewSentryLogger(ctx context.Context) *SentryLogger {
    return &SentryLogger{ctx: ctx}
}

func (l *SentryLogger) Info(msg string, args ...interface{}) {
    log.Printf("[INFO] "+msg, args...)

    sentry.WithScope(func(scope *sentry.Scope) {
        scope.SetLevel(sentry.LevelInfo)
        sentry.CaptureMessage(fmt.Sprintf(msg, args...))
    })
}

func (l *SentryLogger) Error(msg string, args ...interface{}) {
    log.Printf("[ERROR] "+msg, args...)

    sentry.WithScope(func(scope *sentry.Scope) {
        scope.SetLevel(sentry.LevelError)

        // Get current span if available
        if span := sentry.SpanFromContext(l.ctx); span != nil {
            scope.SetContext("trace", map[string]interface{}{
                "trace_id": span.TraceID,
                "span_id":  span.SpanID,
            })
        }

        sentry.CaptureMessage(fmt.Sprintf(msg, args...))
    })
}

func (l *SentryLogger) Fatal(msg string, args ...interface{}) {
    log.Printf("[FATAL] "+msg, args...)

    sentry.WithScope(func(scope *sentry.Scope) {
        scope.SetLevel(sentry.LevelFatal)
        sentry.CaptureMessage(fmt.Sprintf(msg, args...))
    })

    sentry.Flush(2 * time.Second)
    log.Fatalf(msg, args...)
}
```

## Code Examples

### Complete FTP Upload Handler

```go
package main

import (
    "context"
    "fmt"
    "io"
    "os"
    "time"

    "github.com/getsentry/sentry-go"
)

func handleFTPUpload(ctx context.Context, username, filename string, data io.Reader) error {
    // Start transaction
    span := sentry.StartTransaction(
        ctx,
        "ftp.upload",
        sentry.WithTransactionName(fmt.Sprintf("FTP Upload: %s", filename)),
    )
    defer span.Finish()

    // Set user context
    sentry.ConfigureScope(func(scope *sentry.Scope) {
        scope.SetUser(sentry.User{
            Username: username,
        })
        scope.SetTag("protocol", "ftp")
        scope.SetTag("operation", "upload")
    })

    // Add breadcrumb
    sentry.AddBreadcrumb(&sentry.Breadcrumb{
        Category: "ftp",
        Message:  fmt.Sprintf("Upload started: %s", filename),
        Level:    sentry.LevelInfo,
    })

    // Validate file
    validateSpan := span.StartChild("validate")
    validateSpan.Description = "Validate upload request"
    err := validateUpload(username, filename)
    validateSpan.Finish()

    if err != nil {
        span.Status = sentry.SpanStatusInvalidArgument
        sentry.CaptureException(err)
        return err
    }

    // Save to temporary location
    saveSpan := span.StartChild("save.temp")
    saveSpan.Description = "Save to temporary storage"
    tmpPath, err := saveToTemp(data)
    saveSpan.Finish()

    if err != nil {
        span.Status = sentry.SpanStatusInternalError
        sentry.CaptureException(err)
        return err
    }
    defer os.Remove(tmpPath)

    // Upload to S3
    s3Span := span.StartChild("s3.upload")
    s3Span.Description = fmt.Sprintf("Upload %s to S3", filename)
    s3Span.SetData("bucket", "sabaipics-uploads")
    s3Span.SetData("key", filename)

    s3URL, err := uploadToS3(s3Span.Context(), tmpPath, filename)
    s3Span.Finish()

    if err != nil {
        s3Span.Status = sentry.SpanStatusInternalError
        span.Status = sentry.SpanStatusInternalError
        sentry.CaptureException(err)
        return err
    }

    s3Span.Status = sentry.SpanStatusOK
    s3Span.SetData("s3_url", s3URL)

    // Trigger face recognition (async with trace propagation)
    recognitionSpan := span.StartChild("face.recognition.trigger")
    recognitionSpan.Description = "Trigger face recognition workflow"

    err = triggerFaceRecognition(recognitionSpan.Context(), s3URL, username)
    recognitionSpan.Finish()

    if err != nil {
        // Don't fail upload, just log error
        recognitionSpan.Status = sentry.SpanStatusInternalError
        sentry.CaptureException(err)
    } else {
        recognitionSpan.Status = sentry.SpanStatusOK
    }

    span.Status = sentry.SpanStatusOK
    span.SetData("s3_url", s3URL)

    return nil
}

func triggerFaceRecognition(ctx context.Context, imageURL, username string) error {
    span := sentry.StartSpan(ctx, "http.client")
    span.Description = "POST /api/face-recognition"
    defer span.Finish()

    // Build request payload
    payload := map[string]string{
        "image_url": imageURL,
        "username":  username,
    }

    jsonData, _ := json.Marshal(payload)

    // Create HTTP request with context
    req, err := http.NewRequestWithContext(
        span.Context(),
        "POST",
        "https://api.sabaipics.com/face-recognition",
        bytes.NewBuffer(jsonData),
    )
    if err != nil {
        span.Status = sentry.SpanStatusInternalError
        return err
    }

    req.Header.Set("Content-Type", "application/json")

    // Propagate trace
    parentSpan := sentry.SpanFromContext(ctx)
    if parentSpan != nil {
        req.Header.Set("sentry-trace", parentSpan.ToSentryTrace())
        req.Header.Set("baggage", parentSpan.ToBaggage())
    }

    // Execute request
    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        span.Status = sentry.SpanStatusInternalError
        return err
    }
    defer resp.Body.Close()

    span.Status = sentry.HTTPtoSpanStatus(resp.StatusCode)
    span.SetData("status_code", resp.StatusCode)

    if resp.StatusCode >= 400 {
        return fmt.Errorf("face recognition API returned %d", resp.StatusCode)
    }

    return nil
}
```

## Best Practices

1. **Initialize Early**: Call `sentry.Init()` as early as possible in your application
2. **Always Flush**: Use `defer sentry.Flush(2 * time.Second)` before program exit
3. **Use Contexts**: Pass `context.Context` through your call stack for proper trace propagation
4. **Set Appropriate Sample Rates**: Use 100% in development, lower rates in production
5. **Add Meaningful Tags**: Use tags for searchable, low-cardinality data
6. **Use Extra for Details**: Use `SetExtra()` for high-cardinality or detailed information
7. **Breadcrumbs for Flow**: Add breadcrumbs to track the sequence of operations
8. **Goroutine Safety**: Clone hubs when using Sentry in goroutines
9. **HTTP Trace Propagation**: Always propagate trace headers for distributed tracing
10. **Finish Spans**: Always defer `span.Finish()` to ensure spans are sent

## References

- [Sentry Go SDK Documentation](https://docs.sentry.io/platforms/go/)
- [Sentry Go SDK API Reference](https://pkg.go.dev/github.com/getsentry/sentry-go)
- [SFTPGo Custom Actions Documentation](https://docs.sftpgo.com/2.6/custom-actions/)
- [Distributed Tracing 101](https://blog.sentry.io/distributed-tracing-101-for-full-stack-developers/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
