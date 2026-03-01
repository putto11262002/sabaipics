# FTP Upload Component Design

**Status:** Draft
**Last Updated:** 2025-12-08
**Implementation:** ftpserverlib (Go library) with custom driver

---

## Overview

FTP upload is one of four photo upload sources for professional photographers using studio cameras. This doc defines HOW to implement a custom FTP server using ftpserverlib that streams uploads directly to R2 storage without local disk writes, with full distributed tracing and observability.

**Core requirement:** Zero local disk writes - stream directly from camera to R2 via io.Pipe.

**Architecture:** Custom Go service built with ftpserverlib, implementing MainDriver and ClientDriver interfaces for upload-only operations with direct DB and R2 integration.

---

## Critical Decision 1: Protocol Support

**Decision:** FTP + FTPS only (NO SFTP)

**Why:**

- **FTP** - Legacy camera support (older Canon, Sony models)
- **FTPS** - Modern cameras require this (TLS 1.2+)
- **SFTP** - Different protocol (SSH-based), cameras don't support it

**Camera Compatibility:**

- ✅ **Canon** (EOS R6 Mark III, R5 Mark II, R1, R5, R6) - FTPS required
- ✅ **Sony** (A7R V, A7 IV firmware 6.00+) - FTPS required
- ✅ **Nikon** (with WT-7 transmitter) - FTP/FTPS

**All cameras require:**

- Passive mode (PASV) - Cameras are behind WiFi/NAT
- Port 21 control + passive data ports
- Binary transfer mode (automatic for images)

---

## Critical Decision 2: FTP Server Technology

**Decision:** ftpserverlib (Go library) with custom driver implementation

**Why:**

- **Full Control** - Direct integration with application logic (no HTTP roundtrips)
- **Lightweight** - Library embedded in Go service (~10MB memory vs ~50MB standalone server)
- **Direct DB Access** - Auth validation via direct DB query (faster than external HTTP calls)
- **Single Binary** - One service binary for deployment
- **Flexible** - Complete control over FTP behavior, error handling, observability
- **Upload-Only** - Block unsupported commands (download, delete) by returning errors from driver methods

**What ftpserverlib Provides:**

- ✅ Complete FTP/FTPS protocol implementation (RFC 959, RFC 4217)
- ✅ All FTP commands (USER, PASS, STOR, RETR, LIST, etc.)
- ✅ Passive/Active mode support
- ✅ TLS encryption (explicit FTPS via tls.Config)
- ✅ Connection management, timeouts
- ✅ afero filesystem abstraction

**What We Must Implement:**

- **MainDriver interface** - Server settings, auth logic, connection lifecycle, TLS config
- **ClientDriver interface** (afero.Fs) - Per-user filesystem operations
- **FileTransfer interface** - Streaming upload to API via io.Pipe (zero disk writes)
- **Observability** - Custom Sentry spans, Prometheus metrics, structured logging
- **Command rejection** - Return errors from driver methods to block download/delete/rename

**Core Interfaces:**

```go
// github.com/fclairamb/ftpserverlib
type MainDriver interface {
    GetSettings() (*Settings, error)
    ClientConnected(ClientContext) (string, error)
    ClientDisconnected(ClientContext)
    AuthUser(ClientContext, user, pass string) (ClientDriver, error)
    GetTLSConfig() (*tls.Config, error)
}

type ClientDriver interface {
    afero.Fs  // OpenFile, Stat, Remove, Rename, etc.
}

type FileTransfer interface {
    io.Reader
    io.Writer
    io.Closer
    io.Seeker
}
```

**Trade-offs:**

- ✅ **Benefit:** Direct integration, lower latency, full control
- ⚠️ **Cost:** ~600 lines of custom code, 1-2 weeks development, must maintain driver code

**Alternatives considered:**

- **SFTPGo** (uses ftpserverlib internally) - Config-based but requires HTTP adapter for auth/upload
- **Pure-FTPd** - Would need FUSE filesystem for streaming
- **ProFTPD** - Would require custom C module

**License:** MIT (permissive, production-friendly)
**GitHub:** https://github.com/fclairamb/ftpserverlib (457 stars, actively maintained)

---

## Critical Decision 3: Architecture & Integration

```
┌─────────────┐
│ Pro Camera  │
└──────┬──────┘
       │ FTP STOR IMG_1234.jpg
       ▼
┌───────────────────────────────────────────────────────────────┐
│         Custom FTP Server (VPS - $4/mo)                       │
│         Built with ftpserverlib                               │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ MainDriver.AuthUser()                                   │ │
│  │   Trigger: USER/PASS commands                           │ │
│  │   Action:                                               │ │
│  │   1. Parse username: event_{event_id}                   │ │
│  │   2. Direct DB query: SELECT * FROM events              │ │──► Drizzle ORM
│  │      WHERE ftp_username = $1                            │ │    PostgreSQL
│  │   3. Verify password: bcrypt.Compare(hash, password)    │ │
│  │   4. Check: published, upload window open               │ │
│  │   5. Return ClientDriver(event) or error                │ │
│  │   Error → Library sends 530 "Not logged in"             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ClientDriver.OpenFile() (Upload-Only)                   │ │
│  │   Trigger: STOR command                                 │ │
│  │   Action:                                               │ │
│  │   1. Create io.Pipe for streaming                       │ │
│  │   2. Start goroutine: pipe → R2 upload                  │ │──► R2 Storage
│  │   3. FTP writes to pipe (zero disk)                     │ │    (via Workers API)
│  │   4. On close: publish to queue                         │ │
│  │   Other commands (Open, Remove, Rename) → error (550)   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ MainDriver Lifecycle Hooks                              │ │
│  │   ClientConnected() → Create Sentry root span           │ │
│  │   ClientDisconnected() → Finish span, log metrics       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Prometheus Metrics Endpoint                             │ │
│  │   GET :9256/metrics                                     │ │◄─── Scraped every 15s
│  │   Custom metrics: connections, uploads, auth failures   │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
       │
       │ Direct R2 upload via Workers API
       ▼
┌─────────────────────────────────────────────────┐
│    Cloudflare R2 Storage                        │
│    Photo stored with metadata                   │
└─────────┬───────────────────────────────────────┘
          │
          │ Publish to queue after upload
          ▼
┌─────────────────────────────────────────────────┐
│    Cloudflare Queue                             │
│    → Consumer → Rekognition → WebSocket         │
└─────────────────────────────────────────────────┘
```

**Integration Pattern:**

| Operation      | ftpserverlib Hook                 | Implementation                                                | External Call                    |
| -------------- | --------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| **Auth**       | `MainDriver.AuthUser()`           | Query events table by ftp_username, verify bcrypt hash        | PostgreSQL                       |
| **Upload**     | `ClientDriver.OpenFile()`         | io.Pipe → R2 upload goroutine, deduct credit from event owner | Workers API (R2.put), PostgreSQL |
| **Download**   | `ClientDriver.Open()`             | Return error → 550 to camera                                  | None (blocked)                   |
| **Delete**     | `ClientDriver.Remove()`           | Return error → 550 to camera                                  | None (blocked)                   |
| **Rename**     | `ClientDriver.Rename()`           | Return error → 550 to camera                                  | None (blocked)                   |
| **Connect**    | `MainDriver.ClientConnected()`    | Create Sentry span, log event                                 | Sentry                           |
| **Disconnect** | `MainDriver.ClientDisconnected()` | Finish span, metrics                                          | Sentry, Prometheus               |

**Key Advantages:**

1. **No HTTP Roundtrips** - Auth via direct DB query, upload via direct R2 API
2. **Zero Disk Writes** - io.Pipe streams FTP socket → R2 upload
3. **Upload-Only Enforcement** - Unsupported commands return errors from driver methods
4. **Single Binary** - FTP server + upload logic in one Go service
5. **Full Control** - Custom error handling, logging, metrics at every integration point

---

## Critical Decision 4: Authentication & Port Configuration

### Authentication Failure Behavior

**FTP Status Codes:**

| Code  | Meaning                       | When                                |
| ----- | ----------------------------- | ----------------------------------- |
| `530` | Not logged in                 | Auth failed, connection stays open  |
| `421` | Service unavailable           | After 3 failures, closes connection |
| `331` | User name okay, need password | Username accepted                   |
| `230` | User logged in, proceed       | Success                             |

**Multi-Layer Security:**

```
Layer 1: Per-Connection (SFTPGo)
├─ 1st failure → 530 "Not logged in"
├─ 2nd failure → 530 "Not logged in"
└─ 3rd failure → 421 "Too many attempts" + DISCONNECT

Layer 2: Per-IP (Fail2Ban)
└─ 5 failures in 10 min → BAN IP for 15 minutes

Layer 3: Application (Our API)
└─ Log all attempts, flag suspicious accounts
```

### Port Requirements

**Required Ports:**

| Port(s)     | Purpose                       | Firewall Rule               |
| ----------- | ----------------------------- | --------------------------- |
| `21`        | FTP/FTPS control channel      | Allow TCP 21 inbound        |
| `5000-5099` | Passive mode data (100 ports) | Allow TCP 5000:5099 inbound |

**Port Calculation:** `(Max Users × 1.2) + Buffer`

- For 50-100 photographers: 100 ports
- Range 5000-5099 is standard for managed services

**FTPS Ports:** Same as FTP (explicit mode - starts on 21, upgrades to TLS)

**Firewall Configuration:**

```bash
# Allow FTP control
ufw allow 21/tcp comment 'FTP control'

# Allow FTP passive data
ufw allow 5000:5099/tcp comment 'FTP passive data'

# Allow Prometheus metrics (from monitoring server only)
ufw allow from {MONITORING_IP} to any port 9256
```

---

## Critical Decision 5: Observability Integration

**Decision:** Custom instrumentation with Sentry Go SDK and Prometheus

**Why:**

- Distributed tracing requires context propagation across FTP → R2 → Queue
- ftpserverlib provides hooks at all integration points for instrumentation
- Direct control over what to measure and when

### Pattern: Sentry Spans at Driver Hooks

**Challenge:** FTP protocol cannot carry HTTP headers with trace context.

**Solution:** Create root span in `ClientConnected()`, propagate through context, inject into R2 upload.

**Credential Model:** One shared credential per event (see `00_business_rules.md` section 2.5)

- Username: `event_{event_id}`
- All photographers for an event use the same credentials
- Cannot track which photographer uploaded (acceptable trade-off for simplicity)

**Trace Flow:**

```
Camera → MainDriver.ClientConnected() (create ROOT span)
           └─> MainDriver.AuthUser() (child span)
                 └─> ClientDriver.OpenFile() (child span for upload)
                       └─> R2 upload goroutine (inject traceparent via context)
                             └─> Queue publish (propagate via message body)
```

### Instrumentation Points

| ftpserverlib Hook                 | Sentry Operation        | Attributes                                    | Purpose                       |
| --------------------------------- | ----------------------- | --------------------------------------------- | ----------------------------- |
| `MainDriver.ClientConnected()`    | `ftp.connection` (root) | `client.ip`, `server.port`                    | Track entire session          |
| `MainDriver.AuthUser()`           | `ftp.auth`              | `ftp.username`, `event_id`, `photographer_id` | Monitor auth success/failures |
| `ClientDriver.OpenFile()`         | `ftp.upload`            | `file.name`, `file.size`, `event_id`          | Track upload operations       |
| `FileTransfer.Close()`            | Finish upload span      | `bytes_written`, `duration_ms`                | Measure upload performance    |
| `MainDriver.ClientDisconnected()` | Finish connection span  | `files_uploaded`, `total_bytes`               | Session summary               |

### Implementation Pattern

**Root Span Creation:**

```go
// MainDriver.ClientConnected() - Create root span
func (d *Driver) ClientConnected(cc ClientContext) (string, error) {
    span := sentry.StartSpan(context.Background(), "ftp.connection")
    span.SetTag("client.ip", cc.RemoteAddr().String())
    // Store span in context for child spans
    cc.SetContext(sentry.SetHubOnContext(context.Background(), sentry.CurrentHub().Clone()))
    return "SabaiPics FTP", nil
}
```

**Auth Span:**

```go
// MainDriver.AuthUser() - Child span for auth
func (d *Driver) AuthUser(cc ClientContext, user, pass string) (ClientDriver, error) {
    span := sentry.StartSpan(cc.Context(), "ftp.auth")
    defer span.Finish()

    // Direct DB query - lookup event by ftp_username
    // See 00_business_rules.md section 2.5 for validation rules
    event, err := d.db.ValidateFTPCredentials(user, pass)
    if err != nil {
        sentry.CaptureException(err)
        return nil, err  // Returns 530 to camera
    }

    span.SetTag("event.id", event.ID)
    span.SetTag("photographer.id", event.PhotographerID)
    return NewClientDriver(event), nil
}
```

**Upload Span with Trace Propagation:**

```go
// FileTransfer streaming - Propagate to R2 upload
func (t *UploadTransfer) streamToR2() {
    span := sentry.StartSpan(t.ctx, "ftp.upload")
    defer span.Finish()

    // Upload to R2 with trace context in metadata
    err := r2.Put(t.filename, t.pipeReader, map[string]string{
        "traceparent": span.ToSentryTrace(),
        "photographer_id": t.photographerID,
        "event_id": t.eventID,
    })

    if err != nil {
        sentry.CaptureException(err)
        span.SetStatus(sentry.SpanStatusInternalError)
    }
}
```

### Custom Prometheus Metrics

**Define metrics in driver initialization:**

```go
var (
    ftpConnectionsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{Name: "ftp_connections_total"},
        []string{"status"},  // success, auth_failed
    )
    ftpUploadsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{Name: "ftp_uploads_total"},
        []string{"status"},  // success, failed
    )
    ftpUploadDuration = prometheus.NewHistogram(
        prometheus.HistogramOpts{Name: "ftp_upload_duration_seconds"},
    )
)
```

**Instrument at driver hooks:**

- `ClientConnected()` → increment `ftp_connections_total{status="connected"}`
- `AuthUser()` success → increment `ftp_connections_total{status="auth_success"}`
- `AuthUser()` failure → increment `ftp_connections_total{status="auth_failed"}`
- `FileTransfer.Close()` → observe duration, increment `ftp_uploads_total`

### Structured Logging

**Log at each integration point:**

```go
// JSON structured logs with trace context
log.Info().
    Str("event", "ftp.upload.complete").
    Str("trace_id", span.TraceID.String()).
    Str("file_name", filename).
    Int64("file_size", fileSize).
    Dur("duration", duration).
    Msg("Upload completed")
```

See `07_observability.md` for complete Sentry architecture, error tracking patterns, and cost management.

**References:**

- `07_observability.md` - Critical Decision 3 (Go FTP Server Integration)
- Sentry Go SDK: https://docs.sentry.io/platforms/go/
- ftpserverlib: https://pkg.go.dev/github.com/fclairamb/ftpserverlib

---

## Critical Decision 6: Connection Lifecycle & Webhooks

### FTP Username Format

```
{photographer_id}_{event_id}

Example: 550e8400-e29b-41d4-a716-446655440000_7c9e6679-7425-40de-944b-e07fc1f90ae7
```

Parsed on API side to extract photographer and event IDs.

### Webhook Events

**1. Connection Established**

**Trigger:** Camera connects to FTP server
**Endpoint:** `POST /api/webhooks/ftp-upload`

```json
{
  "event": "connection.established",
  "connection_id": "conn-abc123",
  "username": "{photographer_id}_{event_id}",
  "client_ip": "192.168.1.100",
  "timestamp": "2025-12-07T10:30:00Z",
  "trace_id": "abc123"
}
```

**API Action:** Log for monitoring/analytics (optional - can skip if not needed)

---

**2. Connection Closed**

**Trigger:** Camera disconnects from FTP server
**Endpoint:** `POST /api/webhooks/ftp-upload`

```json
{
  "event": "connection.closed",
  "connection_id": "conn-abc123",
  "username": "{photographer_id}_{event_id}",
  "files_uploaded": 3,
  "bytes_transferred": 31457280,
  "duration_ms": 60000,
  "timestamp": "2025-12-07T10:31:00Z",
  "trace_id": "abc123"
}
```

**API Action:**

- Update event stats (optional)
- Log for analytics
- Trigger notifications if needed

---

**File uploads do NOT use webhooks** - they go through HTTPFs backend to `POST /api/ftp/upload` which initiates the standard upload pipeline (Flow #4).

---

## Critical Decision 7: Failure Handling

| Failure Point            | Detection             | Handling                         | FTP Status                | Observability                                                 |
| ------------------------ | --------------------- | -------------------------------- | ------------------------- | ------------------------------------------------------------- |
| **Auth API unreachable** | HTTP timeout/5xx      | Reject FTP login                 | 421 Service unavailable   | `ftp_auth_failures_total{error_type="api_unavailable"}`       |
| **Invalid credentials**  | API returns 401       | Reject FTP login                 | 530 Login incorrect       | `ftp_auth_failures_total{error_type="invalid_credentials"}`   |
| **Event not published**  | API returns 422       | Fail upload                      | 553 File name not allowed | `ftp_uploads_failed_total{error_type="event_not_published"}`  |
| **Upload window closed** | API returns 422       | Fail upload                      | 553 File name not allowed | `ftp_uploads_failed_total{error_type="upload_closed"}`        |
| **Insufficient credits** | API returns 422       | Fail upload                      | 552 Exceeded storage      | `ftp_uploads_failed_total{error_type="insufficient_credits"}` |
| **Rate limit exceeded**  | API returns 429       | Retry 3x with backoff, then fail | 421 Service unavailable   | `ftp_uploads_rate_limited_total`                              |
| **File too large**       | API returns 400       | Fail upload                      | 552 Exceeded storage      | `ftp_uploads_failed_total{error_type="file_too_large"}`       |
| **R2 upload fails**      | API returns 500       | Fail upload, log error           | 451 Internal error        | `ftp_uploads_failed_total{error_type="storage_error"}`        |
| **Network interruption** | Socket closed         | Abort transfer                   | 426 Connection closed     | `ftp_transfers_total{status="incomplete"}`                    |
| **FTP server OOM**       | Process crash         | Reject new connections           | N/A                       | `process_resident_memory_bytes` alert                         |
| **FD exhaustion**        | `too many open files` | Reject new connections           | 421 Service unavailable   | `process_open_fds / process_max_fds` alert                    |
| **Webhook fails**        | HTTP 5xx/timeout      | Log error, continue              | N/A                       | `ftp_webhook_failures_total`                                  |

### Retry Strategy

| Operation        | Retry? | Strategy                               |
| ---------------- | ------ | -------------------------------------- |
| Auth validation  | ❌ No  | Fast fail - invalid is invalid         |
| Upload API 5xx   | ✅ Yes | Retry 3x with exp backoff (1s, 2s, 4s) |
| Upload API 429   | ✅ Yes | Retry with `Retry-After` header        |
| Upload API 4xx   | ❌ No  | Client error, no retry                 |
| Network errors   | ✅ Yes | FTP client handles retry               |
| Webhook failures | ❌ No  | Log only, non-blocking                 |

### Circuit Breaker (Future Enhancement)

**Condition:** API `/ftp/upload` error rate > 50% for 1 minute

**Action:**

1. Open circuit - reject new uploads
2. Return FTP 421 "Service temporarily unavailable"
3. Prevents cascading failures
4. Auto-recover after 30s (half-open → test → close if healthy)

---

## Critical Decision 8: Deployment & Infrastructure

### Server Specs

**Provider:** DigitalOcean Droplet
**Tier:** Basic ($4-6/month)
**Specs:**

- 1 vCPU
- 1 GB RAM
- 25 GB SSD
- 1 TB transfer

**Sufficient for:**

- 10-20 concurrent connections
- ~100 Mbps sustained throughput
- Millions of files/month

### Software Stack

```yaml
# Docker Compose deployment
services:
  ftp-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '21:21' # FTP control
      - '5000-5099:5000-5099' # FTP passive data ports
      - '9256:9256' # Prometheus metrics
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
      - R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
      - R2_ENDPOINT=${R2_ENDPOINT}
      - SENTRY_DSN=${SENTRY_DSN}
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro # TLS certificates
    restart: unless-stopped
```

### Dockerfile

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o ftp-server ./cmd/ftp-server

FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /app
COPY --from=builder /app/ftp-server .

EXPOSE 21 5000-5099 9256
CMD ["./ftp-server"]
```

### Configuration Pattern

**Environment-based configuration:**

```go
// config/config.go
type Config struct {
    FTP struct {
        ListenAddr    string
        PassiveStart  int  // 5000
        PassiveEnd    int  // 5099
        IdleTimeout   int  // 300 seconds
    }
    Database struct {
        URL string
    }
    R2 struct {
        AccessKeyID     string
        SecretAccessKey string
        Endpoint        string
        Bucket          string
    }
    Sentry struct {
        DSN         string
        Environment string
    }
    TLS struct {
        CertFile string  // /etc/letsencrypt/live/ftp.sabaipics.com/fullchain.pem
        KeyFile  string  // /etc/letsencrypt/live/ftp.sabaipics.com/privkey.pem
    }
}
```

### Firewall Rules

```bash
# Allow FTP control
ufw allow 21/tcp

# Allow FTP passive data
ufw allow 5000:5099/tcp

# Allow Prometheus scraping (from monitoring server only)
ufw allow from {MONITORING_IP} to any port 9256

# Deny everything else
ufw default deny incoming
ufw default allow outgoing
```

### Health Check

**Pattern:** Custom HTTP endpoint for health monitoring

```go
// Expose health endpoint on separate port
http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"ok"}`))
})
go http.ListenAndServe(":8080", nil)
```

**Monitoring:** Uptime monitoring every 1 minute
**Alert:** Slack/Email if down > 2 minutes

---

## Critical Decision 9: Security

### TLS/SSL

**Requirement:** FTPS (FTP over TLS) for production

**Certificate:** Let's Encrypt via Certbot

```bash
# Generate cert
certbot certonly --standalone -d ftp.sabaipics.com
```

**Implementation Pattern:**

```go
// MainDriver.GetTLSConfig() - Return TLS configuration
func (d *Driver) GetTLSConfig() (*tls.Config, error) {
    cert, err := tls.LoadX509KeyPair(
        "/etc/letsencrypt/live/ftp.sabaipics.com/fullchain.pem",
        "/etc/letsencrypt/live/ftp.sabaipics.com/privkey.pem",
    )
    if err != nil {
        return nil, fmt.Errorf("failed to load TLS cert: %w", err)
    }

    return &tls.Config{
        Certificates: []tls.Certificate{cert},
        MinVersion:   tls.VersionTLS12,
        CipherSuites: []uint16{
            tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
            tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
        },
    }, nil
}
```

**FTP Server Settings:**

```go
// MainDriver.GetSettings() - Configure explicit FTPS
func (d *Driver) GetSettings() (*ftpserver.Settings, error) {
    return &ftpserver.Settings{
        ListenAddr: "0.0.0.0:21",
        PassiveTransferPortRange: &ftpserver.PortRange{
            Start: 5000,
            End:   5099,
        },
        IdleTimeout: 300, // 5 minutes
    }, nil
}
```

### Authentication

**Method:** Direct DB validation in `MainDriver.AuthUser()`

**Pattern:**

```go
// MainDriver.AuthUser() - Direct DB query
// See 00_business_rules.md section 2.5 for complete validation rules
func (d *Driver) AuthUser(cc ClientContext, user, pass string) (ClientDriver, error) {
    // Query event by ftp_username
    event, err := d.db.GetEventByFTPUsername(user)
    if err != nil {
        return nil, errors.New("invalid credentials")  // Library sends 530
    }

    // Verify password (bcrypt)
    if err := bcrypt.CompareHashAndPassword(
        []byte(event.FTPPasswordHash),
        []byte(pass),
    ); err != nil {
        return nil, errors.New("invalid credentials")  // Library sends 530
    }

    // Business logic checks (see 00_business_rules.md section 2.5)
    if event.Status != "published" {
        return nil, errors.New("event not published")
    }
    if !event.IsUploadWindowOpen() {  // NOW() BETWEEN upload_start AND upload_end
        return nil, errors.New("upload window closed")
    }
    if event.DeletedAt != nil {
        return nil, errors.New("event deleted")
    }

    return NewClientDriver(event), nil
}
```

**Password Security:**

- Auto-generated 32-character alphanumeric token (cryptographically secure)
- Stored as bcrypt hash (cost factor 12) in `events.ftp_password_hash`
- Plaintext shown ONCE to photographer when event published
- Username format: `event_{event_id}` (predictable, but requires password)
- Shared by all photographers for the event (acceptable trade-off)

**Credential Lifecycle:**

- Generated: When event is published
- Valid: During `upload_start_datetime` to `upload_end_datetime`
- Revoked: When event unpublished, deleted, or upload window ends

### Rate Limiting

**Application-level (Custom):**

- Implement in `MainDriver.ClientConnected()`
- Track concurrent connections per event ID
- Max 100 concurrent connections per event (see `00_business_rules.md` section 2.5)
- Track connections per IP to prevent abuse
- Max 50 connections per IP

**Storage-level:**

- R2 upload rate limits (handled by Cloudflare)
- Credit deduction prevents unlimited uploads (1 credit per photo)

### Audit Logging

**All events logged:**

- Connection attempts (success/failure)
- File uploads (success/failure)
- Authentication failures
- Connection duration, files transferred

**Retention:** 90 days (compliance)

---

## What's NOT in This Doc

Implementation details for CONTEXT files:

- Complete MainDriver implementation (see `07_observability.md` for Sentry patterns)
- Complete ClientDriver (afero.Fs) implementation
- Complete FileTransfer streaming implementation (io.Pipe pattern)
- Prometheus metrics definitions and registration
- Database query implementations (Drizzle ORM)
- R2 upload client code (Cloudflare Workers API)
- TLS certificate management (Let's Encrypt)
- Docker deployment configuration
- Grafana dashboard configurations

---

## References

**Planning Docs:**

- `docs/tech/00_flows.md` - Flow #5 (FTP Upload Flow)
- `docs/tech/05_image_pipeline.md` - Critical Decision 8 (FTP Proxy)
- `docs/tech/07_observability.md` - Unified Sentry architecture, distributed tracing, error tracking
- `docs/tech/03_api_design.md` - API endpoints, rate limits

**Research:**

- ftpserverlib GitHub: https://github.com/fclairamb/ftpserverlib
- ftpserverlib GoDoc: https://pkg.go.dev/github.com/fclairamb/ftpserverlib
- ftpserverlib Test Driver: https://github.com/fclairamb/ftpserverlib/blob/master/driver_test.go (reference implementation)
- Afero Filesystem: https://pkg.go.dev/github.com/spf13/afero (ClientDriver interface)
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- Sentry Go SDK: https://docs.sentry.io/platforms/go/
- Prometheus Go Client: https://prometheus.io/docs/guides/go-application/

**Technology:**

- ftpserverlib: Go library for building FTP/FTPS servers
- afero: Filesystem abstraction for virtual filesystems
- io.Pipe: Zero-copy streaming between FTP socket and R2 upload
- Sentry: Unified observability (errors + distributed tracing)
- Prometheus: Custom metrics for FTP operations

---

## Appendix C: ftpserverlib Research & Analysis

**Research Date:** December 8, 2025
**Library:** github.com/fclairamb/ftpserverlib v0.27.0
**Purpose:** Evaluate FTP server implementation options

**DECISION:** ✅ **Using ftpserverlib** for SabaiPics FTP upload component

**Why ftpserverlib over SFTPGo:**

- **Full Control** - Direct integration with DB and R2 (no HTTP roundtrips)
- **Lightweight** - Embedded library (~10MB) vs standalone server (~50MB)
- **Single Binary** - One service deployment
- **Direct Access** - Auth via DB query, upload via R2 API
- **Flexibility** - Custom error handling, logging, observability at every hook

**Trade-off Accepted:** ~600 lines of custom code vs config-based SFTPGo, but gains control and performance.

### C.1 Library Overview

**What is ftpserverlib?**

- Go library for building FTP/FTPS servers using afero as the backend filesystem
- 457 GitHub stars, 101 forks
- Latest release: v0.27.0 (March 2024)
- License: MIT
- Active maintenance, clean codebase

**Production Readiness:**

- Used by SFTPGo (11.4k stars) - battle-tested in production
- Referenced implementation: ftpserver (simple gateway)
- Small memory footprint, no global sync
- Standard library based (minimal dependencies)

**Maturity Assessment:**

- Active development (last commit March 2024)
- Only 3 open issues (low bug count indicates stability)
- Issue #430: IdleTimeout doesn't factor in active data connections (affects large transfers)
- Issue #554: Occasional download errors (reliability concern)
- Comprehensive test suite with 100+ tests

### C.2 Core Architecture

**Key Interfaces We Must Implement:**

1. **MainDriver Interface** (Server-level operations)

```go
type MainDriver interface {
    // Server initialization
    GetSettings() (*Settings, error)

    // Connection lifecycle
    ClientConnected(cc ClientContext) (string, error)
    ClientDisconnected(cc ClientContext)

    // Authentication
    AuthUser(cc ClientContext, user, pass string) (ClientDriver, error)

    // TLS configuration
    GetTLSConfig() (*tls.Config, error)
}
```

**What MainDriver handles:**

- Server settings (ports, timeouts, TLS mode)
- Client connection/disconnection events
- Authentication via external API call
- TLS certificate configuration
- Per-connection tracking and cleanup

2. **ClientDriver Interface** (Per-user filesystem operations)

```go
type ClientDriver interface {
    afero.Fs  // Inherits: OpenFile, Stat, Mkdir, Remove, Rename, etc.
}
```

**What ClientDriver handles:**

- All file operations for authenticated user
- Implements afero.Fs interface (filesystem abstraction)
- Per-user isolation (different drivers per photographer)

3. **Optional Extension Interfaces:**

**ClientDriverExtentionFileTransfer** (streaming without disk):

```go
type ClientDriverExtentionFileTransfer interface {
    GetHandle(name string, flags int, offset int64) (FileTransfer, error)
}
```

**FileTransfer Interface** (streaming I/O):

```go
type FileTransfer interface {
    io.Reader
    io.Writer
    io.Seeker
    io.Closer
}
```

### C.3 What the Library Provides vs What We Build

**Library Handles (Free):**

- FTP/FTPS protocol implementation (RFC 959, RFC 4217)
- All FTP commands (USER, PASS, STOR, RETR, LIST, MLST, etc.)
- Passive mode (PASV/EPSV) and active mode (PORT/EPRT)
- TLS encryption (explicit FTPS via AUTH TLS)
- Connection management, timeouts
- ASCII/binary mode conversion
- Resume support (REST command)
- IPv6 support
- Protocol extensions (HASH, AVLB, COMB)

**We Must Implement:**

- MainDriver with custom authentication logic
- ClientDriver with streaming to HTTP endpoint
- External API integration (POST /api/ftp/auth)
- HTTP upload streaming (POST /api/ftp/upload)
- Sentry instrumentation (spans, errors)
- Prometheus metrics (custom)
- Connection lifecycle logging

### C.4 Authentication Integration Pattern

**How to Implement Custom Authentication:**

```go
// MainDriver.AuthUser called for each login attempt
func (d *CustomDriver) AuthUser(cc ClientContext, user, pass string) (ClientDriver, error) {
    // 1. Call external API for validation
    resp, err := http.Post("https://api.sabaipics.com/api/ftp/auth",
        "application/json",
        bytes.NewBuffer([]byte(fmt.Sprintf(`{"username":"%s","password":"%s","client_ip":"%s"}`,
            user, pass, cc.RemoteAddr().String()))))

    if err != nil {
        return nil, err  // Library returns 530 to client
    }
    defer resp.Body.Close()

    // 2. Check response status
    if resp.StatusCode == 401 {
        return nil, errors.New("invalid credentials")  // 530 Not logged in
    }
    if resp.StatusCode != 200 {
        return nil, errors.New("auth service unavailable")  // 421 Service unavailable
    }

    // 3. Parse response to get user context
    var authResp struct {
        PhotographerID string `json:"photographer_id"`
        EventID        string `json:"event_id"`
    }
    json.NewDecoder(resp.Body).Decode(&authResp)

    // 4. Return ClientDriver with user context
    return NewStreamingClientDriver(authResp.PhotographerID, authResp.EventID), nil
}
```

**Error Handling:**

- Return error from AuthUser → Library sends 530 (Not logged in)
- Can distinguish between invalid credentials vs service errors
- Library handles retry logic per RFC 959

### C.5 Zero-Disk Streaming Pattern

**How to Stream Uploads Without Local Disk:**

**Option 1: Implement ClientDriverExtentionFileTransfer**

```go
type StreamingClientDriver struct {
    photographerID string
    eventID        string
}

// GetHandle bypasses afero.Fs file operations
func (d *StreamingClientDriver) GetHandle(name string, flags int, offset int64) (FileTransfer, error) {
    // Upload (STOR command)
    if flags&os.O_WRONLY != 0 {
        return NewHTTPUploadTransfer(d.photographerID, d.eventID, name, offset), nil
    }

    // Download (RETR command) - not needed for SabaiPics
    if flags&os.O_RDONLY != 0 {
        return nil, errors.New("downloads not supported")
    }

    return nil, errors.New("unsupported operation")
}
```

**Option 2: Streaming FileTransfer Implementation**

```go
type HTTPUploadTransfer struct {
    photographerID string
    eventID        string
    filename       string
    offset         int64

    pipeReader     *io.PipeReader
    pipeWriter     *io.PipeWriter
    uploadDone     chan error
}

func NewHTTPUploadTransfer(photographerID, eventID, filename string, offset int64) *HTTPUploadTransfer {
    pr, pw := io.Pipe()

    transfer := &HTTPUploadTransfer{
        photographerID: photographerID,
        eventID:        eventID,
        filename:       filename,
        offset:         offset,
        pipeReader:     pr,
        pipeWriter:     pw,
        uploadDone:     make(chan error, 1),
    }

    // Start HTTP upload in background
    go transfer.streamToHTTP()

    return transfer
}

// Write implements io.Writer - called by FTP library with file data
func (t *HTTPUploadTransfer) Write(p []byte) (int, error) {
    return t.pipeWriter.Write(p)  // Streams to HTTP goroutine
}

// Seek implements io.Seeker - for REST support
func (t *HTTPUploadTransfer) Seek(offset int64, whence int) (int64, error) {
    t.offset = offset
    return t.offset, nil
}

// Close implements io.Closer - finalize upload
func (t *HTTPUploadTransfer) Close() error {
    t.pipeWriter.Close()  // Signal EOF to HTTP goroutine
    return <-t.uploadDone  // Wait for HTTP upload to complete
}

// Background HTTP upload
func (t *HTTPUploadTransfer) streamToHTTP() {
    // Create multipart request
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)

    // Stream file data from pipe
    part, _ := writer.CreateFormFile("file", t.filename)
    io.Copy(part, t.pipeReader)  // Blocks until Close() called
    writer.Close()

    // POST to API
    req, _ := http.NewRequest("POST", "https://api.sabaipics.com/api/ftp/upload", body)
    req.Header.Set("Content-Type", writer.FormDataContentType())
    req.Header.Set("X-Photographer-ID", t.photographerID)
    req.Header.Set("X-Event-ID", t.eventID)

    resp, err := http.DefaultClient.Do(req)
    t.uploadDone <- err  // Signal completion to Close()
}
```

**How Streaming Works:**

1. FTP client sends STOR command
2. Library calls GetHandle() → returns HTTPUploadTransfer
3. Library calls Write() with file chunks → pipes to HTTP goroutine
4. HTTP goroutine streams to API via multipart/form-data
5. Library calls Close() → waits for HTTP upload to complete
6. Zero disk writes - data flows: FTP socket → pipe → HTTP socket

### C.6 Observability Integration Points

**Where to Add Sentry Instrumentation:**

**1. Connection Lifecycle (MainDriver)**

```go
func (d *MainDriver) ClientConnected(cc ClientContext) (string, error) {
    // Create root span for this FTP connection
    span := sentry.StartSpan(context.Background(), "ftp.connection")
    span.SetTag("ftp.user", "pending")
    span.SetTag("client.ip", cc.RemoteAddr().String())

    // Store span in ClientContext for later use
    cc.SetExtra("sentry_span", span)

    return "SabaiPics FTP Server", nil
}

func (d *MainDriver) ClientDisconnected(cc ClientContext) {
    // Finish root span
    if span, ok := cc.GetExtra("sentry_span").(*sentry.Span); ok {
        span.Finish()
    }
}
```

**2. Authentication (MainDriver.AuthUser)**

```go
func (d *MainDriver) AuthUser(cc ClientContext, user, pass string) (ClientDriver, error) {
    // Create child span for auth
    span := sentry.StartSpan(context.Background(), "ftp.auth")
    defer span.Finish()

    span.SetTag("ftp.user", user)
    span.SetTag("client.ip", cc.RemoteAddr().String())

    // Call auth API
    resp, err := http.Post("https://api.sabaipics.com/api/ftp/auth", ...)
    if err != nil {
        sentry.CaptureException(err)
        span.SetStatus(sentry.SpanStatusInternalError)
        return nil, err
    }

    if resp.StatusCode != 200 {
        span.SetStatus(sentry.SpanStatusPermissionDenied)
        return nil, errors.New("auth failed")
    }

    span.SetStatus(sentry.SpanStatusOK)
    return NewStreamingClientDriver(...), nil
}
```

**3. File Upload (HTTPUploadTransfer)**

```go
func (t *HTTPUploadTransfer) streamToHTTP() {
    // Create span for upload
    span := sentry.StartSpan(context.Background(), "ftp.upload")
    defer span.Finish()

    span.SetTag("file.name", t.filename)
    span.SetTag("photographer.id", t.photographerID)
    span.SetTag("event.id", t.eventID)

    // Generate trace ID for propagation
    traceID := span.TraceID.String()
    spanID := span.SpanID.String()

    // POST to API with traceparent header
    req, _ := http.NewRequest("POST", "https://api.sabaipics.com/api/ftp/upload", body)
    req.Header.Set("traceparent", fmt.Sprintf("00-%s-%s-01", traceID, spanID))

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        sentry.CaptureException(err)
        span.SetStatus(sentry.SpanStatusInternalError)
        t.uploadDone <- err
        return
    }

    if resp.StatusCode != 200 {
        span.SetStatus(sentry.SpanStatusInternalError)
        span.SetTag("http.status", resp.StatusCode)
        t.uploadDone <- fmt.Errorf("upload failed: %d", resp.StatusCode)
        return
    }

    span.SetStatus(sentry.SpanStatusOK)
    t.uploadDone <- nil
}
```

**4. Custom Prometheus Metrics**

```go
var (
    ftpConnectionsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "ftp_connections_total",
            Help: "Total FTP connections",
        },
        []string{"status"},  // success, auth_failed, error
    )

    ftpUploadsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "ftp_uploads_total",
            Help: "Total FTP uploads",
        },
        []string{"status"},  // success, failed, incomplete
    )

    ftpUploadBytes = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name:    "ftp_upload_bytes",
            Help:    "FTP upload size distribution",
            Buckets: prometheus.ExponentialBuckets(1024, 2, 20),  // 1KB to 512MB
        },
    )
)
```

**5. Logging Integration**

- Use fclairamb/go-log adapter for compatibility
- Supports zerolog, zap, logrus, log15, go-kit/log
- Structured logging with context (connection ID, user, file)

### C.7 Comparison with SFTPGo Approach

| Aspect                 | ftpserverlib (Custom)                         | SFTPGo (Decision 2)                   |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| **Development Effort** | High - implement all drivers, auth, streaming | Low - configure existing features     |
| **Observability**      | Custom Sentry integration required            | Built-in Prometheus + webhooks        |
| **Streaming to HTTP**  | Custom FileTransfer implementation            | HTTPFs backend (built-in)             |
| **Authentication**     | Custom MainDriver.AuthUser                    | External auth hook (config only)      |
| **Metrics**            | Custom Prometheus metrics                     | Automatic metrics at /metrics         |
| **Lifecycle Events**   | Manual logging in driver                      | Webhook actions (built-in)            |
| **Testing**            | Full integration test suite required          | Proven in production (SFTPGo uses it) |
| **Maintenance**        | Ongoing - library updates, bug fixes          | Managed by SFTPGo team                |
| **Flexibility**        | Complete control over all aspects             | Limited to SFTPGo features            |
| **Time to Production** | 2-3 weeks development + testing               | 1-2 days configuration                |
| **Risk**               | Medium - custom code can have bugs            | Low - battle-tested solution          |

### C.8 Code Examples - Key Integration Points

**Example 1: Server Initialization**

```go
package main

import (
    "github.com/fclairamb/ftpserverlib"
    "github.com/getsentry/sentry-go"
)

func main() {
    // Initialize Sentry
    sentry.Init(sentry.ClientOptions{
        Dsn: "https://your-dsn@sentry.io/project",
    })
    defer sentry.Flush(2 * time.Second)

    // Create custom driver
    driver := &SabaiPicsDriver{
        authAPIURL: "https://api.sabaipics.com/api/ftp/auth",
    }
    driver.Init()

    // Create FTP server
    server := ftpserverlib.NewFtpServer(driver)

    // Start server
    if err := server.ListenAndServe(); err != nil {
        log.Fatal(err)
    }
}
```

**Example 2: Settings Configuration**

```go
func (d *SabaiPicsDriver) GetSettings() (*ftpserverlib.Settings, error) {
    return &ftpserverlib.Settings{
        ListenAddr:               "0.0.0.0:21",
        PublicHost:               "ftp.sabaipics.com",
        PassiveTransferPortRange: &ftpserverlib.PortRange{Start: 5000, End: 5099},
        IdleTimeout:              300,  // 5 minutes
        ConnectionTimeout:        30,   // 30 seconds
        TLSRequired:              ftpserverlib.ClearOrEncrypted,  // Allow FTP + FTPS
        DefaultTransferType:      ftpserverlib.TransferTypeBinary,
    }, nil
}
```

**Example 3: TLS Configuration**

```go
func (d *SabaiPicsDriver) GetTLSConfig() (*tls.Config, error) {
    cert, err := tls.LoadX509KeyPair(
        "/etc/letsencrypt/live/ftp.sabaipics.com/fullchain.pem",
        "/etc/letsencrypt/live/ftp.sabaipics.com/privkey.pem",
    )
    if err != nil {
        return nil, err
    }

    return &tls.Config{
        Certificates: []tls.Certificate{cert},
        MinVersion:   tls.VersionTLS12,
    }, nil
}
```

### C.9 Production Considerations

**Limitations:**

1. **No Built-in Observability**
   - Must implement custom Prometheus metrics
   - Must implement custom event webhooks
   - More code to maintain

2. **Idle Timeout Issue (#430)**
   - IdleTimeout doesn't account for active data transfers
   - Large files (RAW 50MB) may timeout during upload
   - Workaround: Set very high idle timeout or patch library

3. **Occasional Download Errors (#554)**
   - Reliability concern for production use
   - No details on root cause
   - May affect large file downloads

4. **No HTTPFs Backend**
   - Must implement custom streaming logic
   - More complex than SFTPGo's built-in HTTPFs
   - Higher risk of bugs in streaming code

**Performance Characteristics:**

- Small memory footprint (library design goal)
- No global sync (good for concurrency)
- Standard library based (minimal overhead)
- Afero filesystem adds abstraction layer (minor overhead)

**When to Use ftpserverlib:**

- Need complete control over FTP behavior
- Custom protocol extensions beyond RFC 959
- Embedding FTP server in larger Go application
- Advanced custom authentication logic (beyond HTTP callout)
- Custom storage backend (not HTTP-based)

**When to Use SFTPGo:**

- Need production-ready solution quickly
- Want built-in observability (metrics, webhooks)
- HTTPFs backend meets requirements
- Prefer configuration over code
- Want battle-tested solution (used by 11.4k+ projects)

### C.10 Decision Matrix

| Requirement            | ftpserverlib             | SFTPGo                | Winner            |
| ---------------------- | ------------------------ | --------------------- | ----------------- |
| **FTP/FTPS Protocol**  | ✅ Full support          | ✅ Full support       | Tie               |
| **Passive Mode**       | ✅ Configurable range    | ✅ Configurable range | Tie               |
| **External Auth**      | ✅ Custom implementation | ✅ Built-in hook      | SFTPGo (easier)   |
| **Streaming to HTTP**  | ⚠️ Custom FileTransfer   | ✅ HTTPFs backend     | SFTPGo (built-in) |
| **Prometheus Metrics** | ❌ Custom required       | ✅ Built-in /metrics  | SFTPGo            |
| **Sentry Tracing**     | ⚠️ Manual integration    | ⚠️ Manual integration | Tie               |
| **Lifecycle Events**   | ❌ Manual logging        | ✅ Webhook actions    | SFTPGo            |
| **Development Time**   | 2-3 weeks                | 1-2 days              | SFTPGo            |
| **Maintenance**        | High (custom code)       | Low (configuration)   | SFTPGo            |
| **Flexibility**        | High (full control)      | Medium (config-based) | ftpserverlib      |
| **Production Ready**   | ⚠️ Known issues          | ✅ Battle-tested      | SFTPGo            |
| **Documentation**      | Good (GoDoc, examples)   | Excellent (full docs) | SFTPGo            |

### C.11 Final Recommendation

**Stick with SFTPGo (Critical Decision 2)**

**Why:**

1. **Built-in HTTPFs backend** - Zero-disk streaming without custom code
2. **Built-in observability** - Prometheus metrics + webhooks out-of-the-box
3. **Battle-tested** - Used in production by 11.4k+ projects
4. **Faster time to production** - 1-2 days configuration vs 2-3 weeks development
5. **Lower maintenance** - No custom FTP code to debug/update
6. **Known reliability** - No active issues like ftpserverlib #430, #554

**When to Reconsider ftpserverlib:**

- If SFTPGo doesn't meet a critical requirement (not currently the case)
- If we need custom protocol extensions beyond RFC 959
- If we want to embed FTP in a larger Go service (not planned)
- If HTTPFs backend has performance issues (test first)

**For SabaiPics:**

- SFTPGo meets ALL requirements
- HTTPFs backend handles streaming to HTTP
- External auth hook handles API validation
- Built-in metrics + webhooks reduce custom code
- Production-ready with minimal risk

### C.12 References

**Library Documentation:**

- GitHub: https://github.com/fclairamb/ftpserverlib
- GoDoc: https://pkg.go.dev/github.com/fclairamb/ftpserverlib
- Example Server: https://github.com/fclairamb/ftpserver
- Production Use: https://github.com/drakkan/sftpgo (uses ftpserverlib internally)

**Architecture:**

- Afero Filesystem: https://github.com/spf13/afero
- Test Driver: https://github.com/fclairamb/ftpserverlib/blob/master/driver_test.go
- File Handling: https://github.com/fclairamb/ftpserverlib/blob/master/handle_files.go

**Observability:**

- Sentry Go SDK: https://docs.sentry.io/platforms/go/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- Prometheus Go Client: https://github.com/prometheus/client_golang

**Known Issues:**

- Issue #430: IdleTimeout with active transfers - https://github.com/fclairamb/ftpserverlib/issues/430
- Issue #554: Occasional download errors - https://github.com/fclairamb/ftpserverlib/issues/554

---

## Appendix A: FTP Authentication & Port Requirements Research

### A.1 FTP Authentication Status Codes (RFC 959)

#### Status Code Categories

FTP uses three-digit response codes where:

- **First digit**: Response category (1xx-6xx)
  - 1xx: Positive Preliminary (command accepted, awaiting another reply)
  - 2xx: Positive Completion (command successfully completed)
  - 3xx: Positive Intermediate (need more information)
  - 4xx: Transient Negative (temporary failure, retry possible)
  - 5xx: Permanent Negative (permanent failure, don't retry)
  - 6xx: Protected reply (RFC 2228 - encrypted responses)

- **Second digit**: Grouping
  - x0x: Syntax errors
  - x1x: Information
  - x2x: Connections
  - x3x: Authentication and accounting
  - x4x: Unspecified
  - x5x: File system

#### Authentication-Specific Status Codes

| Code    | Type | Meaning                                           | When Returned                         |
| ------- | ---- | ------------------------------------------------- | ------------------------------------- |
| **220** | 2xx  | Service ready for new user                        | Server startup, initial connection    |
| **331** | 3xx  | User name okay, need password                     | After valid USER command              |
| **332** | 3xx  | Need account for login                            | After USER/PASS (rare, legacy)        |
| **230** | 2xx  | User logged in, proceed                           | Successful authentication             |
| **430** | 4xx  | Invalid username or password                      | Temporary auth failure                |
| **530** | 5xx  | Not logged in                                     | Permanent auth failure (most common)  |
| **421** | 4xx  | Service not available, closing control connection | Server shutting down, max connections |

#### Authentication Flow Examples

**Successful Login:**

```
CLIENT → SERVER: USER photographer_123
SERVER → CLIENT: 331 User name okay, need password
CLIENT → SERVER: PASS secretToken123
SERVER → CLIENT: 230 User logged in, proceed
```

**Failed Password (Standard):**

```
CLIENT → SERVER: USER photographer_123
SERVER → CLIENT: 331 User name okay, need password
CLIENT → SERVER: PASS wrongPassword
SERVER → CLIENT: 530 Not logged in
[Connection remains open, client can retry]
```

**Failed Username:**

```
CLIENT → SERVER: USER invalidUser
SERVER → CLIENT: 530 Not logged in
[Connection remains open, client can retry]
```

**Server Disconnect After Max Retries:**

```
CLIENT → SERVER: PASS wrong1
SERVER → CLIENT: 530 Not logged in
CLIENT → SERVER: PASS wrong2
SERVER → CLIENT: 530 Not logged in
CLIENT → SERVER: PASS wrong3
SERVER → CLIENT: 421 Service not available, closing control connection
[Server closes connection]
```

### A.2 Connection Behavior After Authentication Failure

#### What Happens After 530?

According to RFC 959 and standard implementations:

1. **Connection State**: The control connection (port 21) **remains open** after 530 error
2. **Client Can Retry**: Client may send another USER/PASS sequence without reconnecting
3. **No Automatic Disconnect**: The protocol does NOT require server to disconnect
4. **Server Discretion**: Server MAY choose to close connection (return 421), especially after multiple failures

#### Retry Behavior - Industry Standards

| Scenario         | Connection State     | Client Action  | Server Response         |
| ---------------- | -------------------- | -------------- | ----------------------- |
| 1st failed auth  | Open                 | Can retry      | 530 Not logged in       |
| 2nd failed auth  | Open                 | Can retry      | 530 Not logged in       |
| 3rd failed auth  | Open                 | Can retry      | 530 Not logged in       |
| 4th+ failed auth | **Closed by server** | Must reconnect | 421 Service unavailable |

**Best Practice**: Close connection after 3-5 failed attempts to:

- Slow down brute force attacks
- Force reconnection overhead (rate limiting)
- Free up resources from malicious clients

### A.3 Security Best Practices for Failed Logins

#### Recommended Limits

| Limit Type                 | Threshold                 | Action                     | Duration     | Rationale                      |
| -------------------------- | ------------------------- | -------------------------- | ------------ | ------------------------------ |
| **Per-connection**         | 3 attempts                | Send 421, close connection | N/A          | Force reconnect overhead       |
| **Per-IP (short window)**  | 5 failures in 10 min      | Temporary ban              | 15 min       | Stop single-source brute force |
| **Per-IP (medium window)** | 3 temp bans in 24 hours   | Extended ban               | 24 hours     | Stop persistent attackers      |
| **Per-IP (long window)**   | 5 extended bans in 7 days | Permanent ban              | Manual unban | Block sophisticated attacks    |

#### Implementation Strategy

**Layer 1: Connection-Level (FTP Server)**

```
- Track failed attempts per connection ID
- Max 3 attempts per connection
- Return 421 and disconnect after 3rd failure
- Log: connection_id, IP, username, attempt count
```

**Layer 2: IP-Level (Fail2Ban)**

```ini
[vsftpd]
enabled = true
filter = vsftpd
logpath = /var/log/vsftpd.log
maxretry = 5        # Failed attempts
findtime = 600      # Within 10 minutes
bantime = 900       # Ban for 15 minutes
action = iptables[name=ftp, port="21,5000:5099"]
```

**Layer 3: Application-Level (API)**

```
- Track all FTP auth attempts in database
- Identify patterns: distributed attacks, credential stuffing
- Flag accounts with suspicious activity
- Alert admins of attack campaigns
```

#### Delay After Failed Login

**Progressive Delays** (recommended):

```
Attempt 1: Fail immediately
Attempt 2: 2 second delay before 530
Attempt 3: 5 second delay before 421
```

This slows down automated attacks without significantly impacting legitimate users who mistype once.

### A.4 FTP/FTPS Port Requirements

#### Standard FTP Ports

| Port        | Mode         | Usage                                          | Protocol |
| ----------- | ------------ | ---------------------------------------------- | -------- |
| **21**      | Control      | Commands (USER, PASS, STOR, LIST, etc.)        | TCP      |
| **20**      | Active Data  | Data transfer when server initiates connection | TCP      |
| **Dynamic** | Passive Data | Data transfer when client initiates connection | TCP      |

#### Active vs Passive Mode

**Active Mode (Legacy):**

```
1. Client connects to server port 21 (control)
2. Client sends PORT command with its IP:port
3. Server connects FROM port 20 TO client's port (data)
4. Data flows through server-initiated connection

Problem: Client firewall blocks incoming connections
         NAT breaks server→client connections
```

**Passive Mode (Modern Standard):**

```
1. Client connects to server port 21 (control)
2. Client sends PASV command
3. Server responds: "227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)"
   Where IP = h1.h2.h3.h4, Port = (p1 × 256) + p2
4. Client connects TO server's passive port (data)
5. Data flows through client-initiated connection

Advantage: Works with client firewalls and NAT
```

#### FTPS Port Differences

**Explicit FTPS (AUTH TLS) - Recommended:**

```
Control Port: 21 (same as FTP)
Process:
  1. Client connects to port 21 (plain TCP)
  2. Client sends "AUTH TLS" command
  3. Server responds "234 Proceed with negotiation"
  4. TLS handshake occurs
  5. All subsequent commands/data encrypted

Data Ports: Same passive range as FTP
Advantage: Compatible with FTP-aware firewalls
```

**Implicit FTPS (Legacy/Deprecated):**

```
Control Port: 990 (dedicated)
Process:
  1. Client connects to port 990
  2. TLS handshake immediately (no AUTH command)
  3. All communication encrypted from start

Data Ports: Still uses passive range
Disadvantage: Deprecated, not compatible with FTP firewalls
```

**Recommendation for SabaiPics**: Use **Explicit FTPS on port 21** (industry standard).

### A.5 Passive Mode Port Range Configuration

#### Calculating Required Ports

**Formula:**

```
Required Ports = (Max Concurrent Users × 1.2) + Buffer

Examples:
- 10 users:  (10 × 1.2) + 10 = 22 ports  → Range: 5000-5021
- 50 users:  (50 × 1.2) + 20 = 80 ports  → Range: 5000-5079
- 100 users: (100 × 1.2) + 50 = 170 ports → Range: 5000-5169
```

**Why 1.2 multiplier?**

- Connection overlap during uploads
- Retry connections
- Short-lived control connections

#### Recommended Port Ranges by Scale

| Scenario   | Users   | Port Range | Ports | Firewall Rule       |
| ---------- | ------- | ---------- | ----- | ------------------- |
| **Small**  | 1-20    | 5000-5049  | 50    | Allow TCP 5000:5049 |
| **Medium** | 20-100  | 5000-5149  | 150   | Allow TCP 5000:5149 |
| **Large**  | 100-500 | 5000-5499  | 500   | Allow TCP 5000:5499 |
| **Max**    | 500+    | 5000-5999  | 1000  | Allow TCP 5000:5999 |

**SabaiPics Recommendation**: Start with **5000-5099** (100 ports for ~80 concurrent photographers).

#### Security Considerations

**Why NOT use full range (1024-65535)?**

- ❌ Increases attack surface (64k open ports)
- ❌ Difficult to monitor/audit
- ❌ May conflict with other services
- ❌ Firewall rule complexity

**Why USE restricted range (e.g., 5000-5099)?**

- ✅ Minimal attack surface
- ✅ Easy to monitor specific port range
- ✅ No conflicts with well-known ports
- ✅ Clear firewall rules

#### Server Configuration Examples

**vsftpd (Linux):**

```ini
# /etc/vsftpd.conf
pasv_enable=YES
pasv_min_port=5000
pasv_max_port=5099
pasv_address=203.0.113.100  # Server's public IP
```

**SFTPGo (for SabaiPics):**

```json
{
  "ftpd": {
    "bindings": [
      {
        "port": 21,
        "enable_tls": true,
        "force_passive_ip": "203.0.113.100"
      }
    ],
    "passive_port_range": {
      "start": 5000,
      "end": 5099
    }
  }
}
```

### A.6 Firewall Configuration Requirements

#### Server-Side Firewall Rules

**Using UFW (Uncomplicated Firewall):**

```bash
# Allow FTP control port
ufw allow 21/tcp comment 'FTP control'

# Allow passive data port range
ufw allow 5000:5099/tcp comment 'FTP passive data'

# Enable connection tracking for FTP
modprobe nf_conntrack_ftp
```

**Using iptables:**

```bash
# FTP control
iptables -A INPUT -p tcp --dport 21 -m state --state NEW,ESTABLISHED -j ACCEPT

# FTP passive data
iptables -A INPUT -p tcp --dport 5000:5099 -m state --state NEW,ESTABLISHED -j ACCEPT

# FTP connection tracking (critical!)
modprobe nf_conntrack_ftp
modprobe nf_nat_ftp
iptables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
```

**Why Connection Tracking is Critical:**

- FTP uses separate connections for control and data
- Firewall must understand FTP protocol to allow related data connections
- `nf_conntrack_ftp` kernel module tracks FTP sessions
- Without it, passive mode connections will be blocked

#### Cloud Provider Firewall Examples

**AWS Security Group:**

```
Inbound Rules:
  Rule 1:
    Type: Custom TCP
    Port: 21
    Source: 0.0.0.0/0
    Description: FTP control

  Rule 2:
    Type: Custom TCP
    Port Range: 5000-5099
    Source: 0.0.0.0/0
    Description: FTP passive data
```

**DigitalOcean Firewall:**

```
Inbound Rules:
  - Protocol: TCP
    Ports: 21
    Sources: All IPv4, All IPv6

  - Protocol: TCP
    Ports: 5000-5099
    Sources: All IPv4, All IPv6
```

**Cloudflare (if using):**

```
Note: Cloudflare DOES NOT proxy FTP traffic
Solution: Point ftp.sabaipics.com directly to server IP (DNS only, no proxy)
```

#### Client-Side Considerations

Most modern FTP clients default to **passive mode**, which requires:

- Client firewall allows outbound connections to server's passive port range
- No special configuration needed (outbound typically allowed)

Photographers behind corporate firewalls should:

1. Use passive mode (default in FileZilla, etc.)
2. If blocked, request IT to allow outbound to ftp.sabaipics.com:5000-5099

### A.7 Brute Force Protection with Fail2Ban

#### Installation

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install fail2ban

# CentOS/RHEL
sudo yum install epel-release
sudo yum install fail2ban

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

#### Configuration for FTP

**Create jail for FTP** (`/etc/fail2ban/jail.d/vsftpd.conf`):

```ini
[vsftpd]
enabled = true
port = ftp,ftp-data,5000:5099
filter = vsftpd
logpath = /var/log/vsftpd.log
maxretry = 5
findtime = 600
bantime = 900
action = iptables-multiport[name=vsftpd, port="ftp,ftp-data,5000:5099"]
         sendmail-whois[name=vsftpd, dest=admin@sabaipics.com]
```

**Parameters Explained:**

- `maxretry = 5`: Ban after 5 failed login attempts
- `findtime = 600`: Within 10 minutes (600 seconds)
- `bantime = 900`: Ban IP for 15 minutes (900 seconds)
- `action`: Block via iptables AND send email alert

#### Custom Filter for SFTPGo

**Create filter** (`/etc/fail2ban/filter.d/sftpgo.conf`):

```ini
[Definition]
failregex = ^.*authentication failed.*user:.*client_ip:\s*<HOST>.*$
            ^.*login failed.*\[<HOST>\].*$
ignoreregex =
```

**Update jail**:

```ini
[sftpgo-ftp]
enabled = true
port = ftp,ftp-data,5000:5099
filter = sftpgo
logpath = /var/log/sftpgo/sftpgo.log
maxretry = 5
findtime = 600
bantime = 900
```

#### Advanced: Progressive Ban Times

**Recidivism Jail** (ban repeat offenders longer):

```ini
[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
action = iptables-allports[name=recidive]
         sendmail-whois-lines[name=recidive, dest=admin@sabaipics.com]
bantime = 86400   # 24 hours
findtime = 86400  # Check if banned in last 24 hours
maxretry = 3      # If banned 3+ times, ban for 24 hours
```

#### Monitoring Fail2Ban

```bash
# Check status of all jails
sudo fail2ban-client status

# Check specific jail
sudo fail2ban-client status vsftpd

# Manually ban an IP
sudo fail2ban-client set vsftpd banip 192.168.1.100

# Manually unban an IP
sudo fail2ban-client set vsftpd unbanip 192.168.1.100

# View banned IPs
sudo fail2ban-client get vsftpd banned
```

#### Whitelisting Trusted IPs

**Add to jail config:**

```ini
[vsftpd]
enabled = true
ignoreip = 127.0.0.1/8 ::1
           203.0.113.0/24    # Office IP range
           198.51.100.50     # Specific trusted IP
maxretry = 5
...
```

### A.8 SabaiPics Implementation Recommendations

#### Recommended Configuration

**SFTPGo Configuration:**

```json
{
  "ftpd": {
    "bindings": [
      {
        "port": 21,
        "enable_tls": true,
        "force_passive_ip": "YOUR_PUBLIC_IP",
        "certificate_file": "/etc/letsencrypt/live/ftp.sabaipics.com/fullchain.pem",
        "certificate_key_file": "/etc/letsencrypt/live/ftp.sabaipics.com/privkey.pem",
        "min_tls_version": 12,
        "tls_mode": 2 // Explicit FTPS
      }
    ],
    "passive_port_range": {
      "start": 5000,
      "end": 5099
    },
    "banner": "SabaiPics FTP Server - Use FTPS required"
  },
  "common": {
    "max_auth_tried": 3, // Max attempts per connection
    "defender": {
      "enabled": true,
      "ban_time": 900, // 15 minutes
      "ban_time_increment": 300,
      "threshold": 5, // Failed attempts
      "score_invalid": 2,
      "score_valid": 1,
      "observation_time": 600 // 10 minutes
    }
  }
}
```

**Firewall (UFW):**

```bash
ufw allow 21/tcp comment 'FTP control'
ufw allow 5000:5099/tcp comment 'FTP passive data'
ufw allow from MONITORING_IP to any port 9256 comment 'Prometheus metrics'
ufw default deny incoming
ufw default allow outgoing
ufw enable
```

**Fail2Ban:**

```ini
[sftpgo-auth]
enabled = true
port = ftp,ftp-data,5000:5099
filter = sftpgo
logpath = /var/log/sftpgo/sftpgo.log
maxretry = 5
findtime = 600
bantime = 900
action = iptables-multiport[name=sftpgo, port="21,5000:5099"]
```

#### Security Checklist

- [x] Use Explicit FTPS (TLS 1.2+)
- [x] Restrict passive port range (5000-5099, not full range)
- [x] Max 3 auth attempts per connection
- [x] IP ban after 5 failed attempts in 10 minutes
- [x] 15-minute ban duration
- [x] Enable Fail2Ban for automated protection
- [x] Log all auth attempts with IP addresses
- [x] Monitor metrics for attack patterns
- [x] Connection timeout: 5 minutes idle
- [x] Disable anonymous FTP
- [x] Require TLS for all connections
- [x] Use strong, unique tokens per event

#### Monitoring & Alerts

**Key Metrics:**

```prometheus
# Failed auth attempts per minute
rate(ftp_auth_failures_total[1m]) > 10  # Alert: Brute force attack

# Banned IPs count
fail2ban_banned_ips{jail="sftpgo"} > 5  # Alert: Attack campaign

# Connection success rate
(
  rate(ftp_connections_total{status="success"}[5m]) /
  rate(ftp_connections_total[5m])
) < 0.8  # Alert: < 80% success rate
```

**Alert Thresholds:**

- Warning: 10+ failed logins/minute
- Critical: 50+ failed logins/minute
- Critical: Same IP banned 3+ times in 24 hours

### A.9 Testing Procedures

#### Test Authentication Limits

```bash
#!/bin/bash
# Test max attempts per connection

ftp -n ftp.sabaipics.com <<EOF
user test_photographer_123_event_456
pass wrong1
pass wrong2
pass wrong3
pass wrong4  # Should be rejected with 421
quit
EOF

# Expected: Connection closed after 3rd attempt
```

#### Test IP-Level Banning

```bash
#!/bin/bash
# Trigger Fail2Ban by making 6 rapid failed attempts

for i in {1..6}; do
  ftp -n ftp.sabaipics.com <<EOF
  user test
  pass wrong$i
  quit
EOF
  sleep 2
done

# Check if banned
sudo fail2ban-client status sftpgo-auth
# Expected: Your IP in banned list

# Try to connect again
ftp ftp.sabaipics.com
# Expected: Connection refused
```

#### Test Port Accessibility

```bash
# Test control port
nc -zv ftp.sabaipics.com 21
# Expected: Connection succeeded

# Test passive port range
for port in {5000..5099}; do
  nc -zv -w1 ftp.sabaipics.com $port && echo "Port $port open"
done
# Expected: Ports accessible

# Test FTPS
openssl s_client -connect ftp.sabaipics.com:21 -starttls ftp
# Expected: TLS handshake successful, shows certificate
```

### A.10 References

**RFCs:**

- [RFC 959](https://datatracker.ietf.org/doc/html/rfc959) - File Transfer Protocol (FTP)
- [RFC 2228](https://datatracker.ietf.org/doc/html/rfc2228) - FTP Security Extensions
- [RFC 4217](https://datatracker.ietf.org/doc/html/rfc4217) - Securing FTP with TLS
- [RFC 2428](https://datatracker.ietf.org/doc/html/rfc2428) - FTP Extensions for IPv6 and NATs

**Security Resources:**

- [OWASP - Brute Force Attack Prevention](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks)
- [CIS Benchmark - FTP Server Hardening](https://www.cisecurity.org/)
- [Fail2Ban Official Documentation](https://www.fail2ban.org/wiki/index.php/Main_Page)

**Implementation Guides:**

- [SFTPGo Documentation](https://docs.sftpgo.com/)
- [vsftpd Security Guide](https://security.appspot.com/vsftpd.html)
- [DigitalOcean - FTP Security Best Practices](https://www.digitalocean.com/community/tutorials/how-to-set-up-vsftpd-for-a-user-s-directory-on-ubuntu-20-04)

---

## Appendix B: Professional Camera FTP Compatibility

**Research Date:** December 7, 2025
**Sources:** Canon R6 Mark III specs (2025), Sony A7R V firmware 4.00 release notes (Nov 2025), industry documentation

### B.1 Canon Camera FTP Capabilities

#### Supported Models

- **EOS R6 Mark III** (2025) - Latest flagship
- **EOS R5 Mark II** (2024) - High-resolution flagship
- **EOS R1** (2024) - Professional sports/action
- **EOS R5, R6** (2021-2022) - Popular event photography cameras
- **1DX series, 5D Mark IV** - Professional DSLRs (with compatible firmware)

#### Protocol Support

| Protocol                | Support                        | Notes                                                   |
| ----------------------- | ------------------------------ | ------------------------------------------------------- |
| **FTP**                 | ✅ All models                  | Standard, unencrypted                                   |
| **FTPS** (explicit TLS) | ✅ R6 Mark III, R5 Mark II, R1 | TLS 1.2+                                                |
| **SFTP**                | ⚠️ Via app only                | Canon Content Transfer Professional (paid subscription) |

#### Connection Requirements

```
Port: 21 (standard FTP control port)
Transfer Mode: Binary (automatic for images)
Connection Mode: PASSIVE MODE (PASV) - CRITICAL
Wi-Fi: 2.4 GHz and 5 GHz support (802.11ac, up to 433 Mbps on 5 GHz)
Authentication: Username/password (basic) or TLS (FTPS)
```

#### Transfer Features

- **Built-in FTP server function** - Direct camera-to-server uploads (no PC required)
- **Automatic transfer** - Upload while shooting continues (background)
- **Protected image auto-queue** - Photographer can star/protect images for priority upload
- **Scheduled transfers** - Upload during idle periods (between shots)
- **Continuous shooting mode** - Upload all images immediately
- **Selective mode** - Upload only protected/starred images

#### File Naming & Organization

```
File Naming: Preserves original camera filenames
  - Example: IMG_0001.CR3, IMG_0001.JPG
  - RAW: .CR3 (R series), .CR2 (legacy)
  - JPEG: .JPG, .HEIF (HDR)

Directory Structure: No special requirements
  - Cameras can upload to:
    • Root directory
    • User-specified subdirectories
    • Auto-created folders (configurable)
  - Server should support MKD command (create directory)
```

#### Security Requirements

- **TLS 1.2+** required for FTPS
- **Explicit FTPS** preferred (AUTH TLS command)
- Self-signed certificates acceptable for private networks
- WPA2/WPA3 for Wi-Fi (no WPA/WEP)

#### Canon-Specific Notes

✅ **Most compatible with event photography** - Largest market share among pro photographers
✅ **Mature FTP implementation** - Stable, well-tested in production environments
✅ **Excellent documentation** - User manuals include detailed FTP setup guides
⚠️ **SFTP requires paid app** - Canon Content Transfer Professional subscription needed

---

### B.2 Sony Camera FTP Capabilities

#### Supported Models

- **Alpha 7R V (A7R V)** with firmware 4.00+ (Nov 2025)
- **Alpha 7 IV (A7 IV)** with firmware 6.00+ (Nov 2025)
- **Alpha 7S III** - Video-focused, supports FTP
- **Alpha 9 series** - Sports/action, supports FTP

#### Protocol Support

| Protocol              | Support            | Notes                                              |
| --------------------- | ------------------ | -------------------------------------------------- |
| **FTP**               | ✅ All models      | Standard                                           |
| **FTPS**              | ✅ Firmware 4.00+  | "Improved FTP security" mentioned in release notes |
| **Network Streaming** | ✅ Latest firmware | Direct streaming to Creators' Cloud or custom FTP  |

#### Connection Requirements

```
Port: 21 (standard)
Connection Mode: PASSIVE MODE - CRITICAL
Wi-Fi Security: WPA2/WPA3 REQUIRED (WPA/WEP removed in firmware 4.00)
Authentication: Built-in Wi-Fi with Creators' App support
```

#### Transfer Features (Firmware 4.00+)

**Major Enhancements in Latest Firmware:**

- **Schedule FTP transfers while writing to camera storage** - Non-blocking, continues shooting
- **Auto-schedule protected images** - Upload starred/protected images automatically
- **Auto-protect transferred images** - Mark as uploaded (visual confirmation)
- **Priority transfer** - Specific images jump the queue
- **Continue shooting while transferring** - True background upload
- **Resume interrupted transfers** - REST command support
- **Transfer only differences** - Incremental upload (skip already-uploaded files)

#### Advanced Features

```
Monitor & Control App:
  - Remote focus map display
  - Live preview during upload
  - Remote shooting

Digital Signature Writing:
  - Authenticity Camera Solution (paid license)
  - Cryptographic signature embedded in files
  - Verify images haven't been altered

Relay Playback:
  - View transferred images immediately on connected devices
  - Multi-filter search for uploaded files
```

#### Security Requirements (Firmware 4.00+)

- **No WPA/WEP support** - WPA2 or WPA3 only (security hardening)
- **No IPsec support** - Removed, use Access Authentication instead
- Modern TLS required for FTPS
- Improved connection security with Creators' App

#### Sony-Specific Notes

✅ **Most advanced FTP features** - Resume, incremental, priority transfers
✅ **Active development** - Major firmware updates in Nov 2025
✅ **Cloud integration** - Creators' Cloud direct upload
⚠️ **Firmware-dependent** - Must update to 4.00+ for latest features
⚠️ **Smaller market share** - Less common in event photography vs Canon

---

### B.3 Nikon Camera FTP Capabilities

#### Supported Models

- **D850** (with WT-7 wireless transmitter)
- **Z9, Z8, Z7, Z6 series** (via SnapBridge or wireless accessories)
- **Professional D-series DSLRs** (requires wireless transmitter)

#### Protocol Support

| Protocol                | Support                 | Notes                                           |
| ----------------------- | ----------------------- | ----------------------------------------------- |
| **FTP**                 | ✅ Via WT-7 transmitter | Requires external hardware                      |
| **SnapBridge**          | ✅ Built-in             | Bluetooth + Wi-Fi to mobile apps (not true FTP) |
| **Nikon Imaging Cloud** | ✅ Z series             | Cloud workflow alternative                      |

#### Connection Requirements

```
Hardware: WT-7 Wireless Transmitter (sold separately, ~$800)
Port: 21 (standard)
Connection Mode: Passive mode recommended
Wi-Fi: Standard 802.11ac
```

#### Transfer Features

- **Automatic upload** - Images captured are uploaded immediately
- **Selective transfer** - Marked images only (photographer selects)
- **Background transfer** - Shooting continues while uploading

#### Nikon-Specific Notes

❌ **Requires external hardware** - WT-7 transmitter ($800+) for professional FTP
⚠️ **Less direct FTP support** - Newer mirrorless bodies rely on SnapBridge (mobile-focused)
✅ **Nikon Imaging Cloud** - Alternative workflow for professional photographers
⚠️ **Least prevalent in event photography** - Smaller market share vs Canon/Sony

---

### B.4 Universal FTP Server Requirements (Camera-Compatible)

**MUST-HAVE Features:**

✅ **1. Passive Mode (PASV) - CRITICAL**

```
ALL modern cameras use passive mode exclusively
Server MUST support passive port range (e.g., 5000-5099)
Firewall MUST allow passive data connections
Active mode is OBSOLETE for camera uploads
```

✅ **2. Port Configuration**

```
Control Port: 21 (standard) or custom
Passive Data Ports: Dynamic range (e.g., 5000-5099)
FTPS: Port 21 with TLS upgrade (explicit FTPS via AUTH TLS)
```

✅ **3. Binary Transfer Mode**

```
Automatic for image files (JPEG, RAW, video)
Server MUST support TYPE I (binary) command
Cameras automatically select binary mode for images
```

✅ **4. Authentication Methods**

```
Basic: Username/password (plaintext FTP)
Secure: Username/password over TLS (FTPS)
SSH keys: For SFTP (Canon Content Transfer Pro, limited support)
```

✅ **5. Flexible Directory Structure**

```
NO strict requirements - cameras are flexible
Supported upload targets:
  - Root directory (/)
  - User-specified subdirectories (/events/123/)
  - Auto-created folders (configurable in camera)
Server should allow directory creation (MKD command)
```

✅ **6. File Naming Support**

```
Cameras preserve original filenames
Server MUST support:
  - Long filenames (up to 255 characters)
  - Common extensions:
    Canon: .CR3, .CR2, .JPG, .HEIF, .MP4
    Sony: .ARW, .JPG, .HEIF, .MP4
    Nikon: .NEF, .JPG, .MOV
```

✅ **7. Security (FTPS)**

```
TLS 1.2 or higher (TLS 1.3 recommended)
Explicit FTPS (AUTH TLS) preferred over implicit
Valid SSL/TLS certificates
  - Let's Encrypt OK for production
  - Self-signed OK for private networks
WPA2/WPA3 for Wi-Fi (no WPA/WEP)
```

**NICE-TO-HAVE Features:**

🟡 **Resume Support (REST command)**

- Useful for large RAW files (30-50 MB) or video clips
- Sony firmware 4.00+ supports resume
- Canon supports in latest firmware
- Allows retry after network interruption

🟡 **Multiple Concurrent Connections**

- Allows multiple cameras/photographers to upload simultaneously
- Important for event photography (5-10 photographers typical)
- SabaiPics should support 20+ concurrent connections

🟡 **Bandwidth Throttling**

- Prevent network saturation during peak uploads
- Not required but helpful in shared network environments
- Can prioritize certain photographers or file types

🟡 **Logging & Monitoring**

- Track upload success/failure
- Monitor storage usage per event
- Audit trail for uploaded files
- Already implemented in SFTPGo (Critical Decision 4)

🟡 **Automatic Directory Creation**

- Organize uploads by date, event, or camera ID
- Can be handled server-side (SFTPGo) or via camera settings
- SabaiPics uses HTTPFs backend for dynamic paths

---

### B.5 Typical Event Photography Upload Workflow

#### Pre-Event Setup (Photographer)

```bash
1. Configure camera with FTP server details:
   - Server: ftp.sabaipics.com
   - Port: 21 (or custom)
   - Username: {photographer_id}_{event_id}
   - Password: FTP token (generated by SabaiPics)
   - Destination: /upload/ (or auto-created per event)
   - Mode: FTPS (explicit TLS) recommended

2. Test connection before event:
   - Take test photo
   - Verify upload appears in dashboard
   - Check upload speed (should be <5 seconds for JPEG)

3. Configure upload trigger:
   - Continuous: Upload all images immediately (high bandwidth)
   - Protected: Upload only starred/protected images (efficient)
   - Scheduled: Upload during idle periods (battery-friendly)
```

#### During Event

```bash
1. Photographer shoots images
2. Camera uploads automatically:
   - Continuous mode: Every shot uploaded immediately
   - Selective mode: Only protected/starred images uploaded
3. Upload happens in background:
   - Shooting continues without interruption
   - Camera displays Wi-Fi icon with upload status
4. Dashboard updates in real-time:
   - Face recognition processes uploaded images
   - Event organizer sees instant preview
```

#### Post-Event

```bash
1. Verify all images uploaded successfully:
   - Camera shows transfer history
   - Dashboard shows upload count vs total shots
2. Handle failed uploads:
   - Camera queues failed uploads
   - Retry manually or wait for auto-retry
3. Photographer disconnects from FTP
4. SabaiPics invalidates FTP token (event credentials expire)
```

#### Upload Triggers Comparison

| Mode          | When Upload Starts       | Bandwidth | Battery    | Use Case                          |
| ------------- | ------------------------ | --------- | ---------- | --------------------------------- |
| **Immediate** | After each shot          | High      | High drain | Small events, fast Wi-Fi          |
| **Protected** | Photographer stars image | Low       | Low drain  | Large events, selective sharing   |
| **Scheduled** | During idle periods      | Medium    | Medium     | Automatic, no photographer action |
| **Manual**    | Photographer initiates   | Low       | Low        | Full control, post-event upload   |

---

### B.6 Camera Error Handling Expectations

#### Connection Lost (Wi-Fi Drops)

```
Camera Behavior:
  - Displays error icon (Wi-Fi with X)
  - Automatically retries connection (3-5 attempts)
  - Queues failed uploads for later retry
  - Continues shooting (saves to card)

Server Requirements:
  - Accept reconnection from same IP/username
  - Resume partial uploads (REST command)
  - No penalty for temporary disconnection
```

#### Server Full / Quota Exceeded

```
FTP Response: 552 Exceeded Storage Allocation
Camera Behavior:
  - Displays error message: "Upload failed - storage full"
  - Stops uploading (does not retry)
  - Images remain on camera card
  - Photographer must free space or change server

SabaiPics Behavior:
  - Monitor storage per event (quota system)
  - Alert event organizer before quota reached
  - Offer upgrade to larger storage tier
```

#### Authentication Failure

```
FTP Response: 530 Not logged in
Camera Behavior:
  - Connection rejected immediately
  - Prompts user to re-enter credentials
  - Upload halted until credentials corrected
  - Displays error: "Invalid username or password"

Common Causes:
  - FTP token expired (event ended)
  - Typo in username/password
  - Event not yet published (upload window closed)
```

#### Network Timeout

```
Camera Behavior:
  - Waits 30-60 seconds (configurable timeout)
  - Automatically retries connection
  - May switch to backup server (if configured)
  - Displays timeout warning after 3 failed attempts

Server Requirements:
  - Connection timeout: 5 minutes idle (configurable)
  - Keep-alive supported (NOOP command)
  - Graceful handling of dropped connections
```

#### Required FTP Server Response Codes (RFC 959)

| Code    | Message                                           | Meaning                  | Camera Interpretation         |
| ------- | ------------------------------------------------- | ------------------------ | ----------------------------- |
| **250** | Requested file action okay, completed             | Upload success           | ✅ Display success, continue  |
| **530** | Not logged in                                     | Auth failure             | ❌ Prompt for credentials     |
| **550** | Requested action not taken (permission denied)    | Permission error         | ❌ Display error, stop upload |
| **552** | Requested file action aborted (exceeded storage)  | Quota exceeded           | ❌ Display quota error        |
| **226** | Closing data connection (transfer complete)       | Data transfer success    | ✅ Mark file as uploaded      |
| **421** | Service not available, closing control connection | Server shutdown/overload | ⚠️ Retry after delay          |

---

### B.7 Performance Expectations & Benchmarks

#### Transfer Speeds (Real-World)

```
Wi-Fi 5 GHz (802.11ac):
  - Theoretical: Up to 433 Mbps (Canon R6 Mark III)
  - Realistic throughput: 50-150 Mbps (6-18 MB/s)
  - Factors: Distance to AP, interference, concurrent users

Typical Upload Times:
  - JPEG (5-15 MB): < 1 second
  - RAW (30-50 MB): 2-8 seconds
  - Video clip (100+ MB): 10-30 seconds

Bottleneck: Usually Wi-Fi, not FTP server
```

#### File Size Examples (Canon R6 Mark III)

```
JPEG (Fine Quality):
  - 32.5 MP: ~10-15 MB per file
  - 100 shots: ~1.2 GB

RAW (CR3 Format):
  - Uncompressed: ~50 MB per file
  - Compressed (C-RAW): ~30-35 MB per file
  - 100 shots: ~3.5 GB (C-RAW) or ~5 GB (RAW)

Video (4K 60fps):
  - ~500 MB per minute
  - 10 minutes: ~5 GB
```

#### Concurrent Uploads (Multi-Photographer Events)

```
Scenario: 5 photographers, each uploading simultaneously

Bandwidth Requirements:
  - Per photographer: 6 MB/s average (JPEG mode)
  - Total: 30 MB/s (240 Mbps)
  - Venue Wi-Fi should support 300+ Mbps for headroom

Server Load:
  - FTP connections: 5 concurrent (low load)
  - API upload requests: ~30-50/minute
  - R2 storage writes: ~30-50 MB/minute
  - Face recognition queue: ~30-50 images/minute

Recommended:
  - SFTPGo can handle 20+ concurrent connections
  - Cloudflare Workers auto-scale (no limit)
  - R2 has no throughput limits
```

#### Battery Considerations

```
Canon R6 Mark III (LP-E6P battery):
  - Normal shooting: 620 shots (LCD mode)
  - With Wi-Fi upload: ~400-450 shots (30-40% reduction)
  - Continuous FTP: ~3-4 hours active use

Recommendations:
  - External battery grip (doubles battery life)
  - Multiple spare batteries (3-4 per photographer)
  - AC adapter for studio setups (unlimited power)
  - Selective upload mode (battery-friendly)
```

---

### B.8 SabaiPics Implementation Checklist

#### Server Configuration (SFTPGo)

- [x] Enable passive mode (port range 5000-5099)
- [x] Configure FTPS with TLS 1.2+ (explicit mode)
- [x] Support binary transfer mode (automatic)
- [x] Allow directory creation (MKD command)
- [x] External auth hook (`POST /api/ftp/auth`)
- [x] HTTPFs backend (`POST /api/ftp/upload`)
- [x] Connection lifecycle webhooks
- [x] Prometheus metrics endpoint

#### Authentication & Security

- [x] Username format: `{photographer_id}_{event_id}`
- [x] Password: Generated FTP token (`ftp_{event_id}_{random}`)
- [x] Token invalidated when event expires
- [x] Store tokens hashed in database
- [x] TLS 1.2+ for FTPS (Let's Encrypt certificates)
- [x] WPA2/WPA3 for Wi-Fi (no WPA/WEP)
- [x] Rate limiting: 100 uploads/minute per user
- [x] Max 3 auth attempts per connection (Appendix A)
- [x] Fail2Ban protection (Appendix A)

#### Storage & Organization

- [ ] Auto-create directories per event/photographer
  - Structure: `/events/<event_id>/<photographer_id>/`
- [x] Support both root uploads and subdirectories
- [x] Preserve original camera filenames
- [x] Handle all common extensions (.CR3, .ARW, .NEF, .JPG, .HEIF, .MP4)

#### Monitoring & Observability

- [x] Real-time upload status dashboard
- [x] Alert on upload failures (webhook to API)
- [x] Storage quota monitoring per event
- [x] Transfer speed/bandwidth tracking (Prometheus)
- [x] Distributed tracing (W3C Trace Context)
- [x] Structured logging (JSON format)

#### Camera Compatibility Testing

Priority 1 (MUST TEST):

- [ ] Canon EOS R6 or R5 (most common for events)
  - [ ] FTP upload (port 21, passive mode)
  - [ ] FTPS upload (explicit TLS)
  - [ ] Protected image auto-queue
  - [ ] Background upload while shooting

Priority 2 (SHOULD TEST):

- [ ] Sony A7R V or A7 IV (firmware 4.00+)
  - [ ] FTP upload
  - [ ] Resume interrupted transfer
  - [ ] Incremental upload (differences only)

Priority 3 (NICE TO HAVE):

- [ ] Nikon D850 + WT-7 (if hardware available)
  - [ ] FTP upload via wireless transmitter

#### Network Setup (Event Venues)

- [ ] Provide dedicated SSID for camera uploads
  - Separate from guest Wi-Fi (QoS priority)
- [ ] Configure 5 GHz band for faster transfers
  - 2.4 GHz as fallback for compatibility
- [ ] Bandwidth planning:
  - 50 Mbps per photographer (JPEG mode)
  - 100+ Mbps total for 5 photographers
- [ ] Fallback: Mobile hotspot as backup
- [ ] Wi-Fi range: Mesh network for large venues

#### Documentation (For Photographers)

- [ ] Camera setup guide - Canon (with screenshots)
- [ ] Camera setup guide - Sony (with screenshots)
- [ ] Camera setup guide - Nikon (if supported)
- [ ] Troubleshooting guide:
  - Connection issues
  - Upload failures
  - Authentication errors
- [ ] Best practices:
  - Battery management
  - Selective vs continuous upload
  - Verifying successful uploads

---

### B.9 Known Limitations & Workarounds

#### Limitation 1: SFTP Support Varies

```
Problem:
  - Not all cameras support SFTP natively
  - Canon requires paid app (Content Transfer Professional)
  - Nikon has limited SFTP support

Workaround:
  - Use FTPS as baseline (explicit TLS on port 21)
  - FTPS provides encryption without SSH complexity
  - Compatible with all Canon/Sony cameras
  - SabaiPics already implements FTPS (Critical Decision 9)
```

#### Limitation 2: Wi-Fi Range

```
Problem:
  - Camera Wi-Fi typically limited to 30-50 meters
  - Large event venues (ballrooms, outdoor spaces) exceed range
  - Concrete walls, metal structures reduce range further

Workaround:
  - Mesh network for large venues
    • Multiple access points with same SSID
    • Seamless roaming as photographer moves
  - Wi-Fi extenders/repeaters
  - Dedicated 5 GHz band for cameras (less interference)
  - Position photographer close to AP during uploads
```

#### Limitation 3: Battery Drain

```
Problem:
  - Continuous Wi-Fi upload consumes battery 30-50% faster
  - Canon R6 Mark III: 620 shots → 400-450 shots with FTP
  - Long events (4+ hours) may require mid-event battery swap

Workaround:
  - External battery grips (doubles battery life)
  - Multiple spare batteries (3-4 per photographer)
  - AC adapters for studio/stationary setups
  - Selective upload mode (battery-friendly):
    • Upload only protected/starred images
    • Reduces Wi-Fi active time by 70-80%
```

#### Limitation 4: Transfer Speed vs Shooting Speed

```
Problem:
  - Canon R6 Mark III: 40 fps burst mode
  - RAW files: 30-50 MB each
  - Upload speed: 6-18 MB/s (Wi-Fi)
  - Shooting generates data faster than upload

Workaround:
  - Dual card setup:
    • Card 1: JPEG only, FTP upload enabled (5-15 MB/file)
    • Card 2: RAW + JPEG backup, no FTP (full resolution)
  - Post-event RAW upload via card reader (USB 3.0, faster)
  - Face recognition runs on JPEG uploads (sufficient quality)
  - RAW files archived for high-res prints/delivery
```

#### Limitation 5: Network Saturation (Multi-Photographer)

```
Problem:
  - 10 photographers uploading RAW simultaneously
  - Total bandwidth: 10 × 18 MB/s = 180 MB/s (1.4 Gbps)
  - Venue Wi-Fi may not support this throughput

Workaround:
  - Stagger upload start times (5-10 minute intervals)
  - Use selective upload mode (protected images only)
  - JPEG-only mode during event (RAW post-event)
  - QoS priority for camera SSID (over guest Wi-Fi)
  - Bandwidth throttling per photographer (limit 10 MB/s)
```

---

### B.10 Testing Protocol & Validation

#### Pre-Implementation Tests

**Test 1: Connection & Authentication**

```bash
Goal: Verify passive mode works from camera
Equipment: Canon EOS R6 or R5
Procedure:
  1. Configure camera with test FTP credentials
  2. Connect to ftp.sabaipics.com:21
  3. Verify passive mode negotiation (PASV command)
  4. Check TLS handshake (FTPS)
  5. Confirm authentication success (230 response)
Expected Result: Camera connects, authenticates, ready to upload
```

**Test 2: Upload - Small JPEG**

```bash
Goal: Quick upload test (baseline)
File: Small JPEG (5-10 MB)
Procedure:
  1. Take test photo on camera
  2. Initiate FTP upload
  3. Monitor upload progress on camera LCD
  4. Verify file appears in SabaiPics dashboard
  5. Measure upload time
Expected Result: Upload completes in <2 seconds, file visible in dashboard
```

**Test 3: Upload - Large RAW**

```bash
Goal: Stress test with large file
File: RAW file (30-50 MB)
Procedure:
  1. Take RAW photo on camera
  2. Initiate FTP upload
  3. Monitor upload progress
  4. Verify file appears in dashboard
  5. Measure upload time
Expected Result: Upload completes in 2-8 seconds (depending on Wi-Fi)
```

**Test 4: Concurrent Uploads**

```bash
Goal: Simulate multi-photographer event
Setup: 3-5 cameras uploading simultaneously
Procedure:
  1. Configure all cameras with different credentials
  2. Initiate uploads at same time
  3. Monitor server CPU/memory/network usage
  4. Verify all uploads complete successfully
  5. Check for any timeouts or errors
Expected Result: All uploads succeed, server remains stable
```

**Test 5: Error Scenarios**

| Scenario                          | Trigger                 | Expected Camera Behavior                    | Expected Server Behavior         |
| --------------------------------- | ----------------------- | ------------------------------------------- | -------------------------------- |
| **Invalid credentials**           | Wrong password          | Display "530 Not logged in", prompt retry   | Return 530, log failed attempt   |
| **Server unreachable**            | Disconnect network      | Display timeout error, retry 3x             | N/A (server offline)             |
| **Disk full**                     | Set quota to 0 MB       | Display "552 Exceeded storage", stop upload | Return 552, alert admin          |
| **Network interruption**          | Disconnect mid-transfer | Display error, queue for retry              | Log incomplete transfer          |
| **Firewall blocks passive ports** | Block 5000-5099         | Timeout on data connection                  | Log timeout (no data connection) |

**Test 6: Performance Benchmarks**

```bash
Goal: Measure realistic upload speeds
Metrics:
  - Upload time per file (JPEG, RAW)
  - Throughput (MB/s)
  - Concurrent connection limits
  - Network saturation point
Procedure:
  1. Upload 100 JPEGs, measure average time
  2. Upload 100 RAW files, measure average time
  3. Gradually increase concurrent connections (1→20)
  4. Identify point of degradation
Expected Results:
  - JPEG: <1 second average
  - RAW: 2-5 seconds average
  - 20+ concurrent connections without degradation
```

#### Post-Implementation Validation

**Validation 1: Camera Compatibility Matrix**

```
| Camera Model | FTP | FTPS | SFTP | Passive Mode | Resume | Notes |
|--------------|-----|------|------|--------------|--------|-------|
| Canon R6 Mark III | ✅ | ✅ | ⚠️ Via app | ✅ | ✅ | Full support |
| Canon R5 | ✅ | ✅ | ❌ | ✅ | ✅ | Recommended |
| Sony A7R V (4.00) | ✅ | ✅ | ❌ | ✅ | ✅ | Full support |
| Sony A7 IV (6.00) | ✅ | ✅ | ❌ | ✅ | ✅ | Full support |
| Nikon D850 + WT-7 | ✅ | ⚠️ | ❌ | ✅ | ❌ | Requires WT-7 |
```

**Validation 2: Production Readiness Checklist**

- [ ] FTPS (explicit TLS) enabled and tested
- [ ] Passive mode port range (5000-5099) open in firewall
- [ ] Let's Encrypt certificate installed and auto-renewing
- [ ] External auth hook validated against production API
- [ ] HTTPFs backend tested with real camera uploads
- [ ] Distributed tracing verified (trace ID propagates)
- [ ] Prometheus metrics scraping correctly
- [ ] Fail2Ban configured and tested (Appendix A)
- [ ] Photographer setup guides published
- [ ] Error handling tested (all scenarios pass)

---

### B.11 References & Sources

**Official Canon Documentation:**

- [EOS R6 Mark III Specifications](https://www.usa.canon.com/shop/p/eos-r6-mark-iii-body-with-cropping-guide-firmware) (2025)
- Canon Camera Connect App Documentation
- Canon Content Transfer Professional App (paid subscription)

**Official Sony Documentation:**

- [Alpha 7R V Firmware 4.00 Release Notes](https://www.sony.com/electronics/support/e-mount-body-ilce-7-series/ilce-7rm5/software/00292267) (November 2025)
- Sony Alpha 7 IV Firmware 6.00 Release Notes (November 2025)
- Sony Creators' App Documentation

**Official Nikon Documentation:**

- Nikon D850 Specifications
- WT-7 Wireless Transmitter Documentation
- SnapBridge Functionality Guide

**Industry Standards:**

- RFC 959 - File Transfer Protocol (FTP)
- RFC 4217 - Securing FTP with TLS
- RFC 1579 - Firewall-Friendly FTP (Passive Mode)
- CIPA Wireless Standards for Digital Cameras
- W3C Trace Context Specification (for distributed tracing)

**Research Sources:**

- Canon EOS R6 Mark III user manual (FTP configuration chapter)
- Sony professional camera FTP implementation guide
- Event photography industry best practices
- Wedding & event photography forums (camera setup discussions)

---

### B.12 Conclusion: Camera Compatibility Assessment

**Summary:** The SabaiPics FTP implementation (SFTPGo + HTTPFs + FTPS) is **fully compatible** with modern professional cameras from Canon, Sony, and Nikon.

#### Compatibility Matrix

| Requirement                | SabaiPics Implementation   | Canon                | Sony              | Nikon            |
| -------------------------- | -------------------------- | -------------------- | ----------------- | ---------------- |
| **Passive Mode**           | ✅ Port 5000-5099          | ✅ Required          | ✅ Required       | ✅ Required      |
| **Port 21**                | ✅ Standard FTP control    | ✅ Compatible        | ✅ Compatible     | ✅ Compatible    |
| **FTPS (TLS 1.2+)**        | ✅ Explicit, Let's Encrypt | ✅ R6 III, R5 II, R1 | ✅ Firmware 4.00+ | ⚠️ Limited       |
| **Binary Transfer**        | ✅ Automatic               | ✅ Automatic         | ✅ Automatic      | ✅ Automatic     |
| **Flexible Paths**         | ✅ HTTPFs backend          | ✅ Configurable      | ✅ Configurable   | ✅ Configurable  |
| **Concurrent Connections** | ✅ 20+ supported           | ✅ 1 per camera      | ✅ 1 per camera   | ✅ 1 per camera  |
| **Authentication**         | ✅ External hook           | ✅ User/pass         | ✅ User/pass      | ✅ User/pass     |
| **Resume Transfers**       | ✅ REST supported          | ✅ Latest firmware   | ✅ Firmware 4.00+ | ❌ Not supported |

#### Recommendations

**Priority 1: Canon EOS R Series**

- **Rationale:** Largest market share among professional event photographers
- **Compatibility:** Excellent - all features supported
- **Testing:** Use Canon R6 or R5 as primary test camera
- **Documentation:** Create detailed Canon setup guide first

**Priority 2: Sony Alpha 7/9 Series**

- **Rationale:** Growing market share, advanced FTP features
- **Compatibility:** Excellent with firmware 4.00+ (Nov 2025)
- **Testing:** Validate resume & incremental upload features
- **Documentation:** Create Sony-specific guide (highlight firmware requirements)

**Priority 3: Nikon (Optional)**

- **Rationale:** Smallest market share, requires external hardware (WT-7)
- **Compatibility:** Good but limited (no resume, requires $800 transmitter)
- **Testing:** Only if customer requests Nikon support
- **Documentation:** Note hardware requirement prominently

#### Final Verdict

✅ **NO CHANGES REQUIRED** to existing SabaiPics FTP architecture
✅ **SFTPGo + HTTPFs design is camera-compatible**
✅ **Passive mode, FTPS, external auth already implemented**
✅ **Distributed tracing works across FTP → API → Queue**
✅ **Prometheus metrics cover all camera upload scenarios**

**Action Items:**

1. Test with Canon R6/R5 (priority)
2. Test with Sony A7R V (if available)
3. Create photographer setup guides (Canon, Sony)
4. Monitor first 5 events for upload issues
5. Collect feedback on camera compatibility
