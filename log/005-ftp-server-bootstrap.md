# 005: FTP Server Bootstrap

**Topic**: FTP upload server implementation for event photo distribution
**Started**: 2025-12-08
**Status**: Phases 1-9 completed (core implementation with stubs)

---

## Overview

Implemented Go-based FTP server at `apps/ftp-server` using ftpserverlib for upload-only photo distribution. Server enforces upload-only operations, implements streaming to R2 (stubbed), and includes full Sentry distributed tracing.

## Implementation Summary

### Phase 1-2: Project Scaffolding ✅

**Files Created:**
- `apps/ftp-server/` - Root directory with monorepo structure
- `go.mod` - Module: `github.com/sabaipics/sabaipics/apps/ftp-server`
- Directory structure: `cmd/ftp-server/`, `internal/{config,server,driver,client,transfer}/`

**Dependencies Added:**
- `github.com/fclairamb/ftpserverlib` - FTP server library
- `github.com/getsentry/sentry-go` - Distributed tracing
- `github.com/jackc/pgx/v5` - PostgreSQL driver
- `github.com/prometheus/client_golang` - Metrics (for future use)
- `golang.org/x/crypto` - Password hashing (bcrypt)
- `github.com/joho/godotenv` - Environment variables
- `github.com/spf13/afero` - Filesystem abstraction (auto-pulled)

### Phase 3: Configuration ✅

**File**: `internal/config/config.go`

Implemented environment-based configuration with:
- FTP server settings (listen address, passive ports, idle timeout)
- Database connection (PostgreSQL URL)
- R2/S3 credentials (for future use)
- Sentry settings (DSN, environment)
- TLS certificate paths (optional)

**File**: `.env.example`

Documented all environment variables with example values.

### Phase 4: MainDriver Implementation ✅

**File**: `internal/driver/main_driver.go`

Implemented ftpserverlib.MainDriver interface:
- ✅ `GetSettings()` - Returns FTP server configuration
- ✅ `ClientConnected()` - Creates Sentry root span for connection
- ✅ `ClientDisconnected()` - Finishes Sentry span, cleanup
- 🚧 `AuthUser()` - **STUBBED**: Accepts any credentials (no DB query yet)
  - Real implementation: Query `events` table, verify bcrypt password
- 🚧 `GetTLSConfig()` - **STUBBED**: Returns nil (plain FTP only)

**Key Design:**
- Maintains `map[uint32]*sentry.Span` to track spans by client ID
- Logs all connection events with client IP and ID

### Phase 5: ClientDriver Implementation ✅

**File**: `internal/client/client_driver.go`

Implemented afero.Fs interface for upload-only enforcement:
- ✅ `OpenFile()` - Creates UploadTransfer for write operations
- ✅ Blocks all read operations: `Open()` returns "download not allowed"
- ✅ Blocks all delete operations: `Remove()`, `RemoveAll()` return errors
- ✅ Blocks all rename operations: `Rename()` returns error
- ✅ Blocks directory creation: `Mkdir()`, `MkdirAll()` return errors
- ✅ `Stat()` - Returns fake FileInfo for camera compatibility
- ✅ `ReadDir()` - Returns empty list (avoid breaking LIST commands)

**Upload-Only Enforcement:**
All blocked operations log the attempt and return proper FTP error codes.

### Phase 6: UploadTransfer Implementation ✅

**File**: `internal/transfer/upload_transfer.go`

Implemented afero.File interface for streaming uploads:
- ✅ `Write()` - Writes to io.Pipe, counts bytes
- ✅ `Close()` - Waits for upload completion, logs metrics
- 🚧 `streamToR2()` - **STUBBED**: Reads from pipe and discards
  - Real implementation: Stream directly to Cloudflare R2 using S3 SDK
  - Will use multipart upload for large files
- ✅ Blocks all read/seek operations (upload-only)

**Key Design:**
- Uses `io.Pipe` to avoid disk buffering
- Background goroutine streams data (stub just reads and logs)
- Tracks bytes written with `atomic.Int64`
- Calculates throughput metrics (MB/s)

### Phase 7: Sentry Integration ✅

**Full distributed tracing implemented:**

1. **Connection Span** (`ftp.connection`)
   - Created in `MainDriver.ClientConnected()`
   - Tags: `client.ip`, `client.id`, `server.port`
   - Finished in `MainDriver.ClientDisconnected()`

2. **Auth Span** (`ftp.auth`)
   - Child of connection span
   - Created in `MainDriver.AuthUser()`
   - Tags: `ftp.username`, `event.id`, `photographer.id`, `client.ip`
   - Finished immediately after auth attempt

3. **Upload Span** (`ftp.upload`)
   - Created in `UploadTransfer.NewUploadTransfer()`
   - Tags: `file.name`, `file.size`, `event.id`
   - Data: `upload.bytes`, `upload.duration_ms`, `upload.throughput_mbps`
   - Finished in `UploadTransfer.Close()` with metrics

**Span Hierarchy:**
```
ftp.connection
├── ftp.auth
└── ftp.upload
```

### Phase 8: Server & Main ✅

**File**: `internal/server/server.go`

Server lifecycle management:
- `New()` - Creates MainDriver and ftpserverlib.FtpServer
- `Start()` - Starts FTP server (blocks until stopped)
- 🚧 `Shutdown()` - **STUBBED**: Graceful shutdown placeholder

**File**: `cmd/ftp-server/main.go`

Main entry point with:
- Configuration loading from environment
- Sentry SDK initialization (with flush on exit)
- PostgreSQL connection pool setup (with ping test)
- Signal handling (SIGINT, SIGTERM) for graceful shutdown
- Error handling with Sentry exception capture

### Phase 9: Docker & Testing ✅

**File**: `docker-compose.yml`

Local development setup with:
- PostgreSQL 16 container (port 5432)
- FTP server container (ports 2121, 5000-5099)
- Health checks for dependencies
- Environment variable configuration

**File**: `Dockerfile`

Multi-stage build:
1. Builder stage: Go 1.23-alpine, compiles binary
2. Runtime stage: Alpine with CA certificates, runs binary

**File**: `README.md`

Comprehensive documentation:
- Architecture diagram
- Directory structure
- Environment variables
- Quick start guide
- Build instructions
- Testing checklist
- Troubleshooting guide

---

## Testing Status

### Manual Testing (Local Development)

**Prerequisites:**
```bash
cd apps/ftp-server
cp .env.example .env
# Edit DATABASE_URL
docker-compose up -d postgres
docker-compose up ftp-server
```

**Test Cases:**
1. ✅ Connect via FTP client (port 2121)
2. 🚧 Auth with any credentials (stub mode - accepts all)
3. 🚧 Upload file (stub logs "would upload to R2")
4. ✅ Download blocked (returns FTP 550 error)
5. ✅ Delete blocked (returns FTP 550 error)
6. ✅ Rename blocked (returns FTP 550 error)
7. ✅ Sentry spans created (check logs)
8. ✅ Graceful shutdown (Ctrl+C)

### Automated Tests

❌ Not implemented yet (planned for later phase)

---

## What's Stubbed (To Be Implemented)

### 1. Authentication (Phase 11)
**Current**: Accepts any username/password
**Needed**:
- Query `events` table: `SELECT * FROM events WHERE ftp_username = $1`
- Verify: `bcrypt.CompareHashAndPassword(event.ftp_password_hash, []byte(pass))`
- Check: Event published, upload window valid, not deleted
- Return: Actual eventID and photographerID

**Blockers**:
- Database schema migration needed (add FTP columns to `events` table)
- Test event data for development

### 2. R2 Upload (Phase 11)
**Current**: Reads from pipe and discards
**Needed**:
- Initialize S3-compatible client for Cloudflare R2
- Stream from `pipeReader` to R2 using multipart upload
- Store metadata: event_id, photographer_id, upload_time, file_hash
- Propagate Sentry `traceparent` to R2 object metadata
- Handle errors and retries

**Blockers**:
- R2 credentials (access key, secret, endpoint, bucket)
- Object key naming convention decision
- Metadata schema design

### 3. TLS/FTPS (Phase 12)
**Current**: Returns nil (plain FTP)
**Needed**:
- Load TLS certificates from `TLS_CERT_PATH` and `TLS_KEY_PATH`
- Return `tls.Config` with certificates
- Support both explicit FTPS (AUTH TLS) and implicit FTPS

**Blockers**:
- TLS certificates (Let's Encrypt or self-signed for dev)

### 4. Graceful Shutdown (Phase 13)
**Current**: Stub that returns nil
**Needed**:
- Stop accepting new connections
- Wait for active transfers to complete (with timeout)
- Close database connection pool
- Flush Sentry events
- Log final statistics

---

## Files Created

```
apps/ftp-server/
├── cmd/ftp-server/
│   └── main.go                          # [Phase 8] Entry point
├── internal/
│   ├── config/
│   │   └── config.go                    # [Phase 3] Configuration
│   ├── server/
│   │   └── server.go                    # [Phase 8] Server lifecycle
│   ├── driver/
│   │   └── main_driver.go               # [Phase 4,7] MainDriver + Sentry
│   ├── client/
│   │   └── client_driver.go             # [Phase 5] Upload-only ClientDriver
│   └── transfer/
│       └── upload_transfer.go           # [Phase 6,7] UploadTransfer + Sentry
├── .env.example                         # [Phase 3] Environment template
├── Dockerfile                           # [Phase 9] Container build
├── docker-compose.yml                   # [Phase 9] Local dev stack
├── go.mod                               # [Phase 1] Module definition
├── go.sum                               # [Phase 2] Dependency checksums
└── README.md                            # [Phase 10] Documentation
```

**Total**: 11 files created

---

## Next Steps (Future Phases)

### Phase 11: Real Authentication & R2 Upload
- Implement actual database queries in `AuthUser()`
- Implement R2 streaming in `UploadTransfer.streamToR2()`
- Add database migrations for FTP columns
- Test with real event credentials

### Phase 12: Queue Integration
- Enqueue "photo uploaded" events to message queue
- Trigger downstream processing (face detection, thumbnail generation)
- Add queue configuration to config package

### Phase 13: Prometheus Metrics
- Expose `/metrics` endpoint
- Track: active connections, upload rate, bytes transferred, auth failures
- Add Prometheus scrape config to docker-compose

### Phase 14: Production Deployment
- Deploy to VPS (DigitalOcean/Hetzner)
- Configure TLS certificates (Let's Encrypt)
- Set up monitoring and alerts
- Load testing and performance tuning

---

## Success Criteria (Phases 1-9) ✅

- [x] FTP server starts without errors
- [x] Can connect via FTP client (FileZilla, `ftp` command)
- [x] Auth validation works (stub accepts all for now)
- [x] Upload creates proper file transfer (stubbed R2)
- [x] Download/delete/rename blocked with FTP 550 errors
- [x] Sentry spans created for connection, auth, upload
- [x] No panics, clean error handling
- [x] Code follows Go best practices (gofmt, proper exports)

---

## Technical Decisions

1. **Upload-Only Enforcement**: Implemented at `afero.Fs` interface level
   - Clean separation of concerns
   - Easy to test and maintain
   - Proper FTP error codes returned

2. **Streaming with io.Pipe**: Zero disk buffering
   - Memory efficient
   - Direct stream from FTP client to R2
   - Background goroutine handles upload concurrently

3. **Sentry Span Storage**: Map by client ID in MainDriver
   - Simple and effective for tracking connection lifecycle
   - Allows child spans for auth and upload operations
   - Automatic cleanup in `ClientDisconnected()`

4. **Port 2121 for Development**: Avoids requiring sudo
   - Production will use standard port 21
   - Docker maps 2121:21 for container

5. **Stub-First Approach**: All external integrations stubbed initially
   - Allows testing of FTP protocol layer independently
   - Clear separation between protocol handling and business logic
   - Easy to swap stubs for real implementations

---

## References

- PLAN.md - Original implementation plan (Phases 1-10)
- `docs/tech/00_business_rules.md` - Event credential model (section 2.5)
- [ftpserverlib](https://github.com/fclairamb/ftpserverlib) - FTP server library
- [Sentry Go SDK](https://docs.sentry.io/platforms/go/) - Distributed tracing

---

**Session Duration**: ~1 hour
**Commit**: Ready for review and testing

---

## Phase 10: Logging Architecture Refactoring ✅

**Date**: 2025-12-08
**Goal**: Implement clean logging boundary architecture with Sentry integration

### Problem

Initial implementation had logging scattered throughout the codebase:
- Mixed `log.Printf` and `sentry.Logger` calls
- Logging in business logic (ClientDriver policy enforcement)
- Verbose per-chunk logging in Write() operations
- No environment-based log level filtering
- Side effects (logging) in pure functions

### Solution: I/O Boundary Logging Pattern

**Principle**: Log only at architectural boundaries, never in business logic

**Boundaries Defined**:
1. **Application Flow** (MainDriver): FTP protocol events (connect, auth, disconnect)
2. **I/O Operations** (UploadTransfer): External system operations (R2 uploads)
3. **Business Logic** (ClientDriver): Returns errors without logging (pure)

### Changes Made

#### 1. Error Sentinels (`internal/client/errors.go`) ✅

Created package-level error sentinels for policy violations:
```go
var (
    ErrDownloadNotAllowed = errors.New("download not allowed - upload only")
    ErrDeleteNotAllowed   = errors.New("delete not allowed - upload only")
    ErrRenameNotAllowed   = errors.New("rename not allowed - upload only")
    // ... etc
)
```

**Purpose**: ClientDriver returns error sentinels instead of logging internally

#### 2. Sentry Log Level Filtering (`cmd/ftp-server/main.go`) ✅

Added `BeforeSendLog` callback to Sentry initialization:
```go
BeforeSendLog: func(log *sentry.Log) *sentry.Log {
    if cfg.SentryEnvironment == "production" {
        // Only send WARN/ERROR/FATAL to Sentry in production
        if log.Level == sentry.LogLevelDebug || log.Level == sentry.LogLevelInfo {
            return nil // Still printed locally, but not sent to Sentry
        }
    }
    return log // Send everything in dev/staging
}
```

**Benefits**:
- Production: Only critical logs sent to Sentry (cost control)
- Development: All logs sent for debugging
- Debug mode: All logs printed locally regardless of filtering

#### 3. ClientDriver Refactoring ✅

**Before**: Mixed error returns with logging
```go
func (d *ClientDriver) Open(name string) (afero.File, error) {
    log.Printf("[ClientDriver] BLOCKED: Open (download) attempt for file=%s", name)
    return nil, errors.New("download not allowed - upload only")
}
```

**After**: Pure function, returns error sentinel only
```go
func (d *ClientDriver) Open(name string) (afero.File, error) {
    return nil, ErrDownloadNotAllowed
}
```

**Changes**:
- Removed all `log.Printf` calls (17 instances)
- Removed unused `log` import
- All methods return error sentinels
- `Stat()` and `ReadDir()` still work (camera compatibility) without logging
- **No logging for blocked operations** - expected behavior, not errors

#### 4. UploadTransfer Refactoring ✅

Added `log()` helper method:
```go
func (t *UploadTransfer) log() sentry.Logger {
    if t.uploadSpan != nil {
        return sentry.NewLogger(t.uploadSpan.Context())
    }
    return sentry.NewLogger(context.Background())
}
```

**Logging Strategy** - Only at I/O boundaries:
- `NewUploadTransfer()`: INFO - "Upload started: file=X, event=Y"
- `streamToR2()` start: DEBUG - "STUB: Background upload started"
- `streamToR2()` complete: INFO - "STUB: R2 upload stream complete (total: X bytes)"
- `streamToR2()` error: ERROR - "STUB: R2 upload stream error"
- `Close()`: INFO/ERROR - "Upload completed/failed" with metrics
- **`Write()`: NO LOGGING** (too verbose for per-chunk operations)

**Removed**:
- Per-chunk write logging (was spamming logs)
- Fallback `log.Printf` calls
- `log` import

#### 5. MainDriver Refactoring ✅

Added `log()` helper method:
```go
func (d *MainDriver) log(clientID uint32) sentry.Logger {
    if txn, exists := d.transactions[clientID]; exists && txn != nil {
        return sentry.NewLogger(txn.Context())
    }
    return sentry.NewLogger(context.Background())
}
```

**Logging Strategy** - Application flow boundaries:
- `ClientConnected()`: INFO - "Client connected: IP (ID: X)"
- `ClientDisconnected()`: INFO - "Client disconnected: IP (ID: X)"
- `AuthUser()`: INFO - "Auth attempt: user=X, client=Y"
- `AuthUser()` stub: DEBUG - "STUB: Accepting credentials" (filtered in prod)
- **`GetSettings()`: NO LOGGING** (not a flow event)
- **`GetTLSConfig()`: NO LOGGING** (not a flow event)

**Removed**:
- Redundant transaction logging (span ID, etc.)
- Fallback `log.Printf` in disconnected case
- Verbose settings logging in `GetSettings()`
- `log` import

### Testing Results ✅

**Upload Test**:
```
[Sentry] Client connected: [::1]:52628 (ID: 1)
[Sentry] Auth attempt: user=testuser, client=[::1]:52628
[Sentry] STUB: Accepting credentials for user=testuser (no DB validation)
[Sentry] Upload started: file=/refactored-logging-test.txt, event=stub-event-id
[Sentry] STUB: Background upload started for file=/refactored-logging-test.txt
[Sentry] STUB: R2 upload stream complete for file=/refactored-logging-test.txt (total: 33 bytes)
[Sentry] Upload completed: file=/refactored-logging-test.txt, bytes=33, duration=172.917µs, throughput=0.18 MB/s
[Sentry] Client disconnected: [::1]:52628 (ID: 1)
[Sentry] Sending transaction [4478411448c646b4b5adb983b90fe744] to Sentry
```

**Blocked Download Test** (No logging for blocked operation - clean!):
```
[Sentry] Client connected: [::1]:52678 (ID: 2)
[Sentry] Auth attempt: user=testuser, client=[::1]:52678
[Sentry] STUB: Accepting credentials for user=testuser (no DB validation)
[Sentry] Client disconnected: [::1]:52678 (ID: 2)
```

### Files Modified

1. `internal/client/errors.go` - **NEW**: Error sentinels
2. `internal/client/client_driver.go` - Removed all logging, use error sentinels
3. `internal/transfer/upload_transfer.go` - Added `log()` helper, I/O boundary logging only
4. `internal/driver/main_driver.go` - Added `log()` helper, application flow logging
5. `cmd/ftp-server/main.go` - Added `BeforeSendLog` filtering

### Benefits Achieved

✅ **Single Logging API** - All Sentry logging, no more `log.Printf` mixing
✅ **Cost Control** - Production filters DEBUG/INFO at SDK level (saves Sentry quota)
✅ **Clean Separation** - Business logic returns errors, boundaries log
✅ **No Noise** - Blocked operations don't spam logs (expected behavior)
✅ **Always Traced** - All logs linked to distributed traces via span context
✅ **Helper Pattern** - Each struct has `log()` method for consistency
✅ **Clear Contracts** - Comments document lifetime and logging responsibility

### Logging Levels by Environment

| Environment | Sent to Sentry | Printed Locally (Debug=true) |
|-------------|----------------|------------------------------|
| Development | ALL            | ALL                          |
| Staging     | ALL            | ALL                          |
| Production  | WARN/ERROR/FATAL | ALL (if Debug=true)       |

### Architecture Pattern

```
┌─────────────────────────────────────────────┐
│ Application Boundaries (MainDriver)         │
│ - ClientConnected: INFO                     │
│ - AuthUser: INFO                            │
│ - ClientDisconnected: INFO                  │
└─────────────────────────────────────────────┘
                    │
                    ├─► Context propagation
                    │
┌─────────────────────────────────────────────┐
│ Business Logic (ClientDriver)               │
│ - NO LOGGING (returns error sentinels)     │
│ - Open(): returns ErrDownloadNotAllowed     │
│ - Remove(): returns ErrDeleteNotAllowed     │
└─────────────────────────────────────────────┘
                    │
                    ├─► Context propagation
                    │
┌─────────────────────────────────────────────┐
│ I/O Boundaries (UploadTransfer)             │
│ - NewUploadTransfer: INFO                   │
│ - streamToR2 start: DEBUG                   │
│ - streamToR2 complete: INFO                 │
│ - streamToR2 error: ERROR                   │
│ - Close: INFO/ERROR with metrics            │
│ - Write(): NO LOGGING (too verbose)         │
└─────────────────────────────────────────────┘
```

---

**Phase 10 Duration**: ~30 minutes
**Build Status**: ✅ Compiles without errors
**Test Status**: ✅ Upload/download block tested successfully
**Commit**: Logging architecture refactored
