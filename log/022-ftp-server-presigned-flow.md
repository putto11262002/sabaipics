# 022 - FTP Server Presigned Upload Flow

**Issue:** SAB-73  
**Depends on:** SAB-72 (Phase 1 API - merged to master)

## Goal

Modify the Go FTP server to use the presigned URL flow instead of direct FormData upload to the API.

## Current State (From log/005)

The FTP server (`apps/ftp-server`) was built with:

- Zero-disk streaming via `io.Pipe`
- Direct FormData POST to `POST /api/ftp/upload` (does not exist)
- Hub-based client manager for auth expiry disconnection
- Sentry tracing per upload

**Problem:** The expected API endpoint (`POST /api/ftp/upload`) was never implemented. Phase 1 (SAB-72) implemented a different approach: presigned URL flow.

## New Flow (Phase 1 API)

```
Camera (FTP STOR DSC_0001.JPG)
  │
  ▼
FTP Server
  │
  ├─ Step 1: POST /api/ftp/presign (with JWT)
  │           → Returns presigned R2 PUT URL
  │
  └─ Step 2: PUT to R2 presigned URL (stream file directly)
             → R2 event notification → upload-consumer → process
```

**Benefits:**

- File goes directly to R2 (no CF Worker body size concerns)
- Leverages existing `upload-consumer` pipeline
- Better backpressure handling (R2 has no rate limits)

## Implementation Tasks

### Task 1: Add MIME Type Detection

**File:** `apps/ftp-server/internal/mime/mime.go` (new)

Create a simple extension → MIME type mapper:

```go
package mime

var extensionToMIME = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".heic": "image/heic",
	".heif": "image/heif",
	".webp": "image/webp",
}

// FromFilename returns MIME type from filename extension
// Returns "application/octet-stream" if unknown
func FromFilename(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if mime, ok := extensionToMIME[ext]; ok {
		return mime
	}
	return "application/octet-stream"
}
```

**Why:** Content-Type must be known at presign time (before data flows). Cameras use predictable extensions. The API consumer validates magic bytes anyway.

### Task 2: Update API Client - Add Presign Method

**File:** `apps/ftp-server/internal/apiclient/client.go`

**Add types:**

```go
// PresignRequest represents the presign request payload
type PresignRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	// ContentLength omitted - FTP protocol doesn't guarantee size upfront
}

// PresignResponse represents the presign response from API
type PresignResponse struct {
	UploadID        string            `json:"upload_id"`
	PutURL          string            `json:"put_url"`
	ObjectKey       string            `json:"object_key"`
	ExpiresAt       string            `json:"expires_at"`
	RequiredHeaders map[string]string `json:"required_headers"`
}
```

**Add method:**

```go
// Presign requests a presigned R2 URL for upload
func (c *Client) Presign(ctx context.Context, token, filename, contentType string) (*PresignResponse, *http.Response, error) {
	reqBody := PresignRequest{
		Filename:    filename,
		ContentType: contentType,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/api/ftp/presign", bytes.NewReader(data))
	if err != nil {
		return nil, nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, resp, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, resp, parseAPIError(resp)
	}

	var result struct {
		Data PresignResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, resp, err
	}

	return &result.Data, resp, nil
}
```

**Timeout:** 10 seconds (lightweight JSON call)

### Task 3: Update API Client - Add UploadToPresignedURL Method

**File:** `apps/ftp-server/internal/apiclient/client.go`

```go
// UploadToPresignedURL performs HTTP PUT to R2 presigned URL
func (c *Client) UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "PUT", putURL, reader)
	if err != nil {
		return nil, err
	}

	// Apply required headers from presign response
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	return c.HTTPClient.Do(req)
}
```

**Timeout:** 30 minutes (same as old FormData upload - handles large files on slow connections)

### Task 4: Remove UploadFormData Method

**File:** `apps/ftp-server/internal/apiclient/client.go`

Delete the `UploadFormData()` method and its associated multipart writer logic. Update the `APIClient` interface:

```go
type APIClient interface {
	Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error)
	Presign(ctx context.Context, token, filename, contentType string) (*PresignResponse, *http.Response, error)
	UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error)
}
```

### Task 5: Modify UploadTransfer

**File:** `apps/ftp-server/internal/transfer/upload_transfer.go`

**Current structure:**

```go
type UploadTransfer struct {
	pipeReader *io.PipeReader
	pipeWriter *io.PipeWriter
	uploadDone chan error
	// ... fields
}
```

**Changes needed:**

1. **Add fields:**

   ```go
   presignedURL string
   requiredHeaders map[string]string
   ```

2. **Modify constructor to accept presign data:**

   ```go
   func NewUploadTransfer(client APIClient, token, eventID, filename string, presignedURL string, headers map[string]string) *UploadTransfer
   ```

3. **Change upload goroutine** (the one that currently calls `UploadFormData`):

   **Before:**

   ```go
   go func() {
       _, resp, err := t.client.UploadFormData(ctx, t.token, t.eventID, t.filename, t.pipeReader)
       t.uploadDone <- err
   }()
   ```

   **After:**

   ```go
   go func() {
       resp, err := t.client.UploadToPresignedURL(ctx, t.presignedURL, t.requiredHeaders, t.pipeReader)

       if err != nil {
           t.uploadDone <- err
           return
       }
       defer resp.Body.Close()

       if resp.StatusCode != http.StatusOK {
           t.uploadDone <- fmt.Errorf("R2 upload failed: %d", resp.StatusCode)
           return
       }

       t.uploadDone <- nil
   }()
   ```

4. **Update error handling** in the `Close()` method to map R2 errors properly (see Task 7).

### Task 6: Modify ClientDriver.OpenFile()

**File:** `apps/ftp-server/internal/client/client_driver.go`

**Current flow:**

```go
func (d *ClientDriver) OpenFile(name string, flag int) (afero.File, error) {
    // ... validation
    transfer := NewUploadTransfer(...)
    return transfer, nil
}
```

**New flow - add presign step BEFORE creating transfer:**

```go
func (d *ClientDriver) OpenFile(name string, flag int) (afero.File, error) {
    // 1. Existing validation (writable, auth check, etc.)
    // ... keep existing code

    // 2. Detect MIME type from filename
    contentType := mime.FromFilename(name)

    // 3. Call presign API
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    presignResp, httpResp, err := d.client.Presign(ctx, d.token, name, contentType)
    if err != nil {
        // Map presign errors to FTP errors (see Task 7)
        return nil, mapPresignError(err, httpResp)
    }

    // 4. Create transfer with presigned URL
    transfer := NewUploadTransfer(
        d.client,
        d.token,
        d.eventID,
        name,
        presignResp.PutURL,
        presignResp.RequiredHeaders,
    )

    return transfer, nil
}
```

**Key:** Presign happens **synchronously** at STOR time, before any data flows. If presign fails, we return FTP error immediately.

### Task 7: Two-Stage Error Handling

**File:** `apps/ftp-server/internal/client/client_driver.go` (new helper functions)

Create error mapping functions:

```go
// mapPresignError maps presign API errors to FTP errors
func mapPresignError(err error, resp *http.Response) error {
    if resp == nil {
        return fmt.Errorf("presign request failed: %w", err)
    }

    switch resp.StatusCode {
    case 401:
        // JWT expired - trigger EventAuthExpired via manager
        return &AuthExpiredError{Message: "JWT expired"}
    case 402:
        return ftpserver.Error{
            Code:    550,
            Message: "Insufficient credits",
        }
    case 410:
        return ftpserver.Error{
            Code:    550,
            Message: "Event expired",
        }
    case 429:
        // Retry with backoff (see Task 8)
        return &RateLimitedError{RetryAfter: parseRetryAfter(resp)}
    case 500, 502, 503:
        return ftpserver.Error{
            Code:    451,
            Message: "Temporary server error, please retry",
        }
    default:
        return ftpserver.Error{
            Code:    451,
            Message: fmt.Sprintf("Upload failed: %d", resp.StatusCode),
        }
    }
}

// mapR2UploadError maps R2 PUT errors to FTP errors
func mapR2UploadError(err error, statusCode int) error {
    if err != nil {
        // Network error during transfer
        return ftpserver.Error{
            Code:    426,
            Message: "Transfer aborted",
        }
    }

    switch statusCode {
    case 200:
        return nil // Success
    case 403:
        // Presigned URL expired (shouldn't happen - 5min TTL)
        return ftpserver.Error{
            Code:    451,
            Message: "Upload URL expired, please retry",
        }
    case 500, 503:
        return ftpserver.Error{
            Code:    451,
            Message: "Storage service error, please retry",
        }
    default:
        return ftpserver.Error{
            Code:    451,
            Message: fmt.Sprintf("Upload failed: %d", statusCode),
        }
    }
}
```

**Usage in UploadTransfer.Close():**

```go
err := <-t.uploadDone
if err != nil {
    // Check if it's an R2 error or presign error
    // Presign errors already mapped in OpenFile()
    // Here we only handle R2 upload errors
    return mapR2UploadError(err, t.lastStatusCode)
}
return nil
```

### Task 8: Add 429 Retry Logic with Exponential Backoff

**File:** `apps/ftp-server/internal/client/client_driver.go`

Wrap the presign call in `OpenFile()` with retry logic:

```go
func (d *ClientDriver) OpenFile(name string, flag int) (afero.File, error) {
    // ... validation, MIME detection

    // Presign with retry on 429
    var presignResp *PresignResponse
    var err error

    backoff := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second}

    for attempt := 0; attempt <= len(backoff); attempt++ {
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        presignResp, httpResp, err := d.client.Presign(ctx, d.token, name, contentType)
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

    // ... create transfer
}
```

**Why this is different from the old behavior:**

- Old: 429 → immediate disconnect via `EventRateLimited`
- New: 429 on presign → retry 3 times (cheap, no file data sent yet), then return FTP 451 if still failing
- Connection stays open — next STOR command can try again

### Task 9: Update Manager Event Handling

**File:** `apps/ftp-server/internal/clientmgr/manager.go`

**Current behavior:** On `EventRateLimited`, disconnects the client (lines 154-158).

**Change:** Check if the 429 came from presign or upload. If from presign, the retry logic in `OpenFile()` handles it. Only disconnect on 429 from actual upload (though R2 doesn't return 429).

Since we're removing `UploadFormData()`, and R2 PUTs don't return 429, we can simplify:

- Remove `EventRateLimited` handling (presign 429 handled in OpenFile)
- Keep `EventAuthExpired` (JWT expiry still triggers disconnect)

### Task 10: Update Tests

**Files to update:**

- `apps/ftp-server/internal/apiclient/client_test.go`
- `apps/ftp-server/internal/transfer/upload_transfer_test.go`
- `apps/ftp-server/internal/client/client_driver_test.go`

**Changes:**

1. Remove tests for `UploadFormData()`
2. Add tests for `Presign()` (various status codes: 200, 401, 402, 429, 5xx)
3. Add tests for `UploadToPresignedURL()` (success, network error, 403)
4. Mock the two-stage flow in `OpenFile()` tests
5. Test 429 retry logic (exponential backoff, Retry-After header)

### Task 11: E2E Testing

**Manual test flow:**

1. **Setup:**
   - API deployed with Phase 1 changes (SAB-72)
   - FTP server with Phase 2 changes running locally
   - Event created in dashboard with FTP credentials generated

2. **Test with camera simulator / FTP client:**

   ```bash
   # Connect via FTP
   ftp ftp.staging.sabaipics.com
   # Login with FTP credentials (username from dashboard)
   user evt-abc12345
   pass <generated-password>

   # Upload a JPEG
   put test-photo.jpg
   ```

3. **Verify:**
   - FTP server logs show: presign → R2 PUT → 226 Transfer complete
   - R2 bucket shows uploaded file at `uploads/{eventId}/{uploadId}-{timestamp}`
   - API `upload_intents` table shows: `status = 'uploaded'`, `source = 'ftp'`
   - Queue consumer processes: normalizes → creates photo → enqueues face detection
   - Dashboard shows photo in event

4. **Test error paths:**
   - No credits: should get FTP 550
   - Expired JWT: should disconnect, require re-auth
   - Network interruption during upload: should get FTP 426, allow retry

## Implementation Order

```
1. Task 1: Add MIME type detection helper (mime/mime.go)
2. Task 2: Add Presign() method to API client
3. Task 3: Add UploadToPresignedURL() method
4. Task 4: Remove UploadFormData() method, update interface
5. Task 5: Modify UploadTransfer to use presigned URL
6. Task 6: Modify ClientDriver.OpenFile() to call presign first
7. Task 7: Add two-stage error mapping functions
8. Task 8: Add 429 retry logic with exponential backoff
9. Task 9: Update Manager event handling (simplify)
10. Task 10: Update tests
11. Task 11: E2E testing
```

## Open Questions

1. **Content-Length for presign:** Currently omitted. FTP protocol doesn't guarantee file size before STOR. The API presign endpoint defaults to 20MB for signing purposes. The upload-consumer validates actual size after upload. **Decision: keep as-is.**

2. **Should we add metrics/tracing for presign calls?** The existing Sentry tracing is per-upload. Should we add a separate span for presign? **Decision: yes, add `sentry.StartSpan` around presign call.**

3. **Backward compatibility:** If we need to roll back, the old `UploadFormData` code is deleted. **Decision: acceptable - Phase 1 API is live, no going back to the non-existent `/api/ftp/upload` endpoint.**

## Success Criteria

- [ ] Camera/FTP client can authenticate and upload photos successfully
- [ ] Photos land in R2 and are processed by upload-consumer
- [ ] Error handling works (no credits, expired event, JWT expiry)
- [ ] 429 retry logic tested (though unlikely to hit in practice)
- [ ] Zero-disk streaming preserved (io.Pipe still works)
- [ ] E2E test passes: camera → FTP → presign → R2 → queue → photo indexed
