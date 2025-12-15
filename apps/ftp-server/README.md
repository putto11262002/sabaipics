# SabaiPics FTP Server

Upload-only FTP server for event photo distribution, built with Go and ftpserverlib.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Camera    │────▶│   FTP Server     │────▶│  SabaiPics   │
│  (FTP/FTPS) │     │ (VPS Proxy)      │     │    API       │
└─────────────┘     └──────────────────┘     └──────────────┘
                             │                      │
                             ▼                      ▼
                    ┌──────────────┐        ┌──────────────┐
                    │    Sentry    │        │   R2 + D1    │
                    │  (Tracing)   │        │  (Storage)   │
                    └──────────────┘        └──────────────┘
```

The FTP server is a **thin proxy** that:
1. Receives FTP uploads from cameras
2. Authenticates via `POST /api/ftp/auth`
3. Streams uploads via `POST /api/ftp/upload` (FormData)

All business logic (validation, storage, metadata) lives in the Cloudflare Workers API.

### Key Features

- **Upload-Only**: Blocks download, delete, and rename operations (FTP RETR, DELE, RNFR/RNTO)
- **Streaming Uploads**: Uses `io.Pipe` to stream via FormData to API without disk buffering
- **API-Based Auth**: FTP credentials validated by API, returns JWT token
- **Distributed Tracing**: Sentry spans for upload operations
- **Camera Compatible**: Returns fake file info for cameras that check existence before upload
- **Centralized Client Management**: Hub-based event handling for auth expiry and rate limits

## Directory Structure

```
apps/ftp-server/
├── cmd/ftp-server/           # Main entry point
│   └── main.go
├── internal/
│   ├── apiclient/            # HTTP client for SabaiPics API
│   ├── clientmgr/            # Centralized client management hub
│   ├── config/               # Environment configuration
│   ├── server/               # FTP server lifecycle
│   ├── driver/               # MainDriver (ftpserverlib interface)
│   ├── client/               # ClientDriver (afero.Fs, upload-only enforcement)
│   └── transfer/             # UploadTransfer (io.Pipe streaming to API)
├── .env.example              # Environment variable template
├── Dockerfile                # Production container image
├── docker-compose.yml        # Local development setup
└── README.md                 # This file
```

## Prerequisites

- Go 1.24+
- Docker & Docker Compose (for local development)
- Sentry account (optional, for telemetry)
- SabaiPics API (for authentication and uploads)

## Environment Variables

See `.env.example` for all available configuration options.

### Required

- `API_URL`: SabaiPics API base URL
  ```
  API_URL=https://api.sabaipics.com
  ```

### Optional

- `FTP_LISTEN_ADDRESS`: FTP server bind address (default: `0.0.0.0:2121`)
- `FTP_PASSIVE_PORT_START`: Passive port range start (default: `5000`)
- `FTP_PASSIVE_PORT_END`: Passive port range end (default: `5099`)
- `FTP_IDLE_TIMEOUT`: Client idle timeout in seconds (default: `300`)
- `FTP_DEBUG`: Enable FTP protocol logging (default: `false`)
- `SENTRY_DSN`: Sentry project DSN (for distributed tracing)
- `SENTRY_ENVIRONMENT`: Sentry environment (default: `development`)
- `TLS_CERT_PATH`, `TLS_KEY_PATH`: TLS certificate paths for FTPS
- `IMPLICIT_FTPS_ENABLED`: Enable implicit FTPS on port 990 (default: `false`)

## Quick Start (Development)

### 1. Clone and Setup

```bash
cd apps/ftp-server
cp .env.example .env
# Edit .env with your API_URL
```

### 2. Start FTP Server

```bash
# Run directly
go run ./cmd/ftp-server

# Or build and run
go build -o ftp-server ./cmd/ftp-server
./ftp-server
```

The FTP server will be available at `localhost:2121` (passive ports: `5000-5099`).

### 3. Test Connection

Using FileZilla:
- Host: `localhost`
- Port: `2121`
- Protocol: FTP (or FTPS if TLS configured)
- Username: Your event FTP username (from API)
- Password: Your event FTP password (from API)

### 4. Test Upload

```bash
# From FTP prompt:
ftp> put test.jpg
# Should succeed and stream to API

# Download should fail:
ftp> get test.jpg
# Error: "download not allowed - upload only"
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

### ✅ Implemented

- [x] Go module setup with monorepo naming
- [x] Configuration loading from environment
- [x] FTP server with ftpserverlib (explicit and implicit FTPS)
- [x] Upload-only enforcement (blocks RETR, allows uploads)
- [x] API-based authentication (`POST /api/ftp/auth`)
- [x] Streaming upload to API via FormData (`POST /api/ftp/upload`)
- [x] Sentry distributed tracing (upload-level transactions)
- [x] Centralized client management (hub-based event handling)
- [x] TLS/FTPS support (explicit and implicit modes)
- [x] JWT token lifecycle (reactive 401 detection → disconnect)
- [x] Rate limit handling (429 response → disconnect)

### 🚧 Pending

- [ ] Automated testing
- [ ] Production deployment documentation

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

## FTPS (FTP over TLS) Configuration

The FTP server supports FTPS (explicit TLS mode - AUTH TLS) for secure file transfers.

### Option 1: Self-Signed Certificates (Development/Testing)

**Generate certificates:**
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SabaiPics/CN=localhost"
```

**Update `.env`:**
```bash
TLS_CERT_PATH=certs/cert.pem
TLS_KEY_PATH=certs/key.pem
```

**Note**: FTP clients will show certificate warnings that must be manually accepted.

### Option 2: Let's Encrypt (Production)

**Prerequisites:**
- Domain name pointing to your server (e.g., `ftp.yourdomain.com`)
- Server publicly accessible on port 80 (for ACME challenge)
- Certbot installed

**Install Certbot:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# CentOS/RHEL
sudo yum install certbot
```

**Generate Certificate:**
```bash
# Stop FTP server if running
sudo systemctl stop ftp-server

# Generate certificate (certbot will start temporary web server)
sudo certbot certonly --standalone -d ftp.yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/ftp.yourdomain.com/fullchain.pem (certificate)
# /etc/letsencrypt/live/ftp.yourdomain.com/privkey.pem (private key)
```

**Update `.env` (Production):**
```bash
TLS_CERT_PATH=/etc/letsencrypt/live/ftp.yourdomain.com/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/ftp.yourdomain.com/privkey.pem
```

**Set up Auto-Renewal:**
```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Add renewal cron job
sudo crontab -e

# Add this line (runs daily at midnight, renews if <30 days remain)
0 0 * * * certbot renew --quiet --post-hook "systemctl restart ftp-server"
```

**File Permissions:**
```bash
# Certbot certs are owned by root, FTP server needs read access
# Option 1: Run FTP server as root (not recommended)
# Option 2: Copy certs to FTP server user directory (recommended)

# Create cert directory
sudo mkdir -p /opt/ftp-server/certs

# Copy and set permissions
sudo cp /etc/letsencrypt/live/ftp.yourdomain.com/fullchain.pem /opt/ftp-server/certs/
sudo cp /etc/letsencrypt/live/ftp.yourdomain.com/privkey.pem /opt/ftp-server/certs/
sudo chown ftp-user:ftp-user /opt/ftp-server/certs/*.pem
sudo chmod 600 /opt/ftp-server/certs/privkey.pem

# Update .env to use copied certs
TLS_CERT_PATH=/opt/ftp-server/certs/fullchain.pem
TLS_KEY_PATH=/opt/ftp-server/certs/privkey.pem

# Update post-hook to copy certs on renewal
0 0 * * * certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/ftp.yourdomain.com/*.pem /opt/ftp-server/certs/ && chown ftp-user:ftp-user /opt/ftp-server/certs/*.pem && systemctl restart ftp-server"
```

### Testing FTPS

**Using curl:**
```bash
# Test upload with FTPS (explicit TLS)
curl -v --ftp-ssl --insecure -T testfile.txt ftp://user:pass@localhost:2121/testfile.txt

# For production with valid certificate (remove --insecure)
curl -v --ftp-ssl -T testfile.txt ftp://user:pass@ftp.yourdomain.com:21/testfile.txt
```

**Using FileZilla:**
1. File → Site Manager → New Site
2. Protocol: FTP - File Transfer Protocol
3. Encryption: **Require explicit FTP over TLS**
4. Host: `ftp.yourdomain.com` (or `localhost` for testing)
5. Port: `21` (production) or `2121` (development)
6. Connect

**Verify TLS Connection:**
```bash
# Check if server accepts TLS
openssl s_client -starttls ftp -connect localhost:2121
# Should show: "Verify return code: 18 (self signed certificate)" for dev
# Or "Verify return code: 0 (ok)" for Let's Encrypt
```

### Disabling FTPS (Plain FTP)

To run plain FTP without TLS, comment out or remove from `.env`:
```bash
#TLS_CERT_PATH=certs/cert.pem
#TLS_KEY_PATH=certs/key.pem
```

Server will automatically fall back to plain FTP if these are not set.

## Production Deployment

**TODO**: This will be documented when implementing Phase 14 (Production Deployment).

Planned deployment target: DigitalOcean/Hetzner VPS with Docker.

## Troubleshooting

### "API_URL is required"

- Set `API_URL` in your `.env` file to the SabaiPics API base URL

### "auth failed"

- Verify your FTP credentials are valid for the event
- Check that the event upload window is still active
- Check API connectivity from the FTP server

### "bind: address already in use"

- Another process is using port 2121 or 21
- Change `FTP_LISTEN_ADDRESS` in `.env` to use a different port
- Or stop the conflicting process

### FileZilla shows "Connection timed out" in passive mode

- Ensure passive ports `5000-5099` are exposed and not firewalled
- Check Docker port mapping: `docker-compose ps`

### Upload hangs or times out

- Check server logs for API connectivity issues
- Verify API_URL is reachable from the FTP server
- Increase `FTP_IDLE_TIMEOUT` if needed for large uploads

## Testing

### Manual Testing Checklist

- [ ] Connect via FTP client (FileZilla, `ftp` command)
- [ ] Auth works with valid event credentials
- [ ] Upload file succeeds (streams to API)
- [ ] Download blocked (returns "download not allowed" error)
- [ ] Auth expiry triggers disconnect (401 from API)
- [ ] Rate limit triggers disconnect (429 from API)
- [ ] Graceful shutdown works (Ctrl+C)

### Automated Tests

**TODO**: Add unit tests and integration tests.

## References

- [ftpserverlib Documentation](https://github.com/fclairamb/ftpserverlib)
- [Sentry Go SDK](https://docs.sentry.io/platforms/go/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [SabaiPics Technical Docs](../../docs/tech/)

## License

Proprietary - SabaiPics Platform
