# SabaiPics FTP Server

Upload-only FTP server for event photo distribution, built with Go and ftpserverlib.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Camera    │────▶│   FTP Server     │────▶│      R2      │
│  (FTP/FTPS) │     │ (Upload-Only)    │     │  (Storage)   │
└─────────────┘     └──────────────────┘     └──────────────┘
                             │
                             ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  PostgreSQL  │     │    Sentry    │
                    │  (Auth/Meta) │     │ (Tracing)    │
                    └──────────────┘     └──────────────┘
```

### Key Features

- **Upload-Only**: Blocks download, delete, and rename operations (FTP RETR, DELE, RNFR/RNTO)
- **Streaming Uploads**: Uses `io.Pipe` to stream directly to R2 without disk buffering
- **Event-Based Auth**: One shared FTP credential per event (see `docs/tech/00_business_rules.md`)
- **Distributed Tracing**: Sentry spans for connection, auth, and upload operations
- **Camera Compatible**: Returns fake file info for cameras that check existence before upload

## Directory Structure

```
apps/ftp-server/
├── cmd/ftp-server/           # Main entry point
│   └── main.go
├── internal/
│   ├── config/               # Environment configuration
│   ├── server/               # FTP server lifecycle
│   ├── driver/               # MainDriver (ftpserverlib interface)
│   ├── client/               # ClientDriver (afero.Fs, upload-only enforcement)
│   └── transfer/             # UploadTransfer (io.Pipe streaming to R2)
├── .env.example              # Environment variable template
├── Dockerfile                # Production container image
├── docker-compose.yml        # Local development setup
└── README.md                 # This file
```

## Prerequisites

- Go 1.21+ (developed with 1.23)
- PostgreSQL 16+ (for authentication)
- Docker & Docker Compose (for local development)
- Sentry account (optional, for telemetry)
- Cloudflare R2 bucket (for production uploads)

## Environment Variables

See `.env.example` for all available configuration options.

### Required

- `DATABASE_URL`: PostgreSQL connection string
  ```
  postgresql://user:password@localhost:5432/sabaipics?sslmode=disable
  ```

### Optional

- `FTP_LISTEN_ADDRESS`: FTP server bind address (default: `0.0.0.0:2121`)
- `FTP_PASSIVE_PORT_START`: Passive port range start (default: `5000`)
- `FTP_PASSIVE_PORT_END`: Passive port range end (default: `5099`)
- `FTP_IDLE_TIMEOUT`: Client idle timeout in seconds (default: `300`)
- `SENTRY_DSN`: Sentry project DSN (for distributed tracing)
- `SENTRY_ENVIRONMENT`: Sentry environment (default: `development`)
- `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`: R2/S3 credentials

## Quick Start (Development)

### 1. Clone and Setup

```bash
cd apps/ftp-server
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Start with Docker Compose

```bash
docker-compose up -d postgres  # Start PostgreSQL first
docker-compose up ftp-server   # Start FTP server
```

The FTP server will be available at `localhost:2121` (passive ports: `5000-5099`).

### 3. Test Connection

Using the `ftp` command:

```bash
ftp localhost 2121
# Username: any-username (stub accepts all)
# Password: any-password (stub accepts all)
```

Using FileZilla:
- Host: `localhost`
- Port: `2121`
- Protocol: FTP (plain, not FTPS yet)
- Username: any (stub mode)
- Password: any (stub mode)

### 4. Test Upload

```bash
# From FTP prompt:
ftp> put test.jpg
# Should succeed with stub logging

# Download should fail:
ftp> get test.jpg
# Error: "download not allowed - upload only"

# Delete should fail:
ftp> delete test.jpg
# Error: "delete not allowed - upload only"
```

## Build from Source

### Local Build

```bash
go build -o ftp-server ./cmd/ftp-server
./ftp-server
```

### Docker Build

```bash
docker build -t sabaipics-ftp-server .
docker run -p 2121:21 -p 5000-5099:5000-5099 --env-file .env sabaipics-ftp-server
```

## Current Implementation Status

### ✅ Implemented (Phases 1-9)

- [x] Go module setup with monorepo naming
- [x] Configuration loading from environment
- [x] FTP server with ftpserverlib
- [x] Upload-only enforcement (blocks RETR, DELE, RNFR/RNTO)
- [x] Streaming upload with io.Pipe (stubbed R2 upload)
- [x] Sentry distributed tracing (connection, auth, upload spans)
- [x] Docker Compose for local testing

### 🚧 Stubbed (To Be Implemented Later)

- [ ] **Authentication**: Currently accepts any credentials (no DB query)
  - Real implementation: Query `events` table by `ftp_username`
  - Verify password with `bcrypt.CompareHashAndPassword`
  - Check upload window (`upload_start_datetime` to `upload_end_datetime`)
- [ ] **R2 Upload**: Currently just reads and discards bytes
  - Real implementation: Stream to Cloudflare R2 using S3 SDK
  - Multipart upload for large files
  - Store metadata (event_id, photographer_id, upload_time)
- [ ] **TLS/FTPS**: Returns nil (plain FTP only)
  - Real implementation: Load certificates from `TLS_CERT_PATH` and `TLS_KEY_PATH`
- [ ] **Graceful Shutdown**: Basic signal handling
  - Real implementation: Wait for active transfers, timeout after 30s

## Logs and Debugging

All components log with prefixes for easy filtering:

```bash
# Filter by component
docker-compose logs ftp-server | grep "\[MainDriver\]"
docker-compose logs ftp-server | grep "\[UploadTransfer\]"

# Watch live logs
docker-compose logs -f ftp-server
```

Log prefixes:
- `[Server]`: Server lifecycle (start, stop, shutdown)
- `[MainDriver]`: Connection, auth events
- `[ClientDriver]`: File operations, blocked operations
- `[UploadTransfer]`: Upload progress, streaming, completion metrics

## Production Deployment

**TODO**: This will be documented when implementing Phase 14 (Production Deployment).

Planned deployment target: DigitalOcean/Hetzner VPS with Docker.

## Troubleshooting

### "Failed to connect to database"

- Ensure PostgreSQL is running: `docker-compose ps postgres`
- Check `DATABASE_URL` in `.env`
- Test connection: `psql $DATABASE_URL`

### "bind: address already in use"

- Another process is using port 2121 or 21
- Change `FTP_LISTEN_ADDRESS` in `.env` to use a different port
- Or stop the conflicting process

### FileZilla shows "Connection timed out" in passive mode

- Ensure passive ports `5000-5099` are exposed and not firewalled
- Check Docker port mapping: `docker-compose ps`

### Upload hangs or times out

- Check server logs: `docker-compose logs -f ftp-server`
- Verify stub is logging "Would upload to R2" messages
- Increase `FTP_IDLE_TIMEOUT` if needed

## Testing

### Manual Testing Checklist

- [ ] Connect via FTP client (FileZilla, `ftp` command)
- [ ] Auth works (accepts any credentials in stub mode)
- [ ] Upload file succeeds (check logs for "STUB: Would upload to R2")
- [ ] Download blocked (returns "download not allowed" error)
- [ ] Delete blocked (returns "delete not allowed" error)
- [ ] Rename blocked (returns "rename not allowed" error)
- [ ] Sentry spans created (check logs for "Created Sentry span")
- [ ] Graceful shutdown works (Ctrl+C)

### Automated Tests

**TODO**: Add unit tests and integration tests in later phases.

## References

- [ftpserverlib Documentation](https://github.com/fclairamb/ftpserverlib)
- [Sentry Go SDK](https://docs.sentry.io/platforms/go/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [SabaiPics Technical Docs](../../docs/tech/)

## License

Proprietary - SabaiPics Platform
