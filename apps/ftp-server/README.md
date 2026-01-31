# SabaiPics FTP Server

Upload-only FTP/FTPS server that proxies camera uploads to SabaiPics via presigned R2 URLs.

## How It Works

1. Camera connects via FTP/FTPS
2. Server authenticates with `POST /api/ftp/auth`
3. File is buffered to disk to determine size
4. Server calls `POST /api/ftp/presign` (includes `contentLength`)
5. File is uploaded to R2 with the presigned URL

## Quick Start (Local)

```bash
cd apps/ftp-server
cp .env.example .env

# Update API_URL in .env (local Wrangler)
# API_URL=http://localhost:8787

go run ./cmd/ftp-server
```

Default ports:
- Explicit FTPS: `2121`
- Implicit FTPS: `990` (enabled by default)
- Passive data ports: `5000-5099`

## Test Upload (CLI)

```bash
# Explicit FTPS
curl --ftp-ssl --insecure -T photo.jpg ftp://USER:PASS@localhost:2121/photo.jpg

# Implicit FTPS
curl --ssl-reqd --insecure -T photo.jpg ftps://USER:PASS@localhost:990/photo.jpg

# Plain FTP
curl -T photo.jpg ftp://USER:PASS@localhost:2121/photo.jpg
```

## Required Config

- `API_URL` (base URL of SabaiPics API)

See `apps/ftp-server/ENV_CONFIG_REFERENCE.md` for all options.

## Deploy (Docker)

```bash
docker build -t sabaipics-ftp-server .
docker run --restart unless-stopped \
  -p 21:21 -p 990:990 -p 60000-60100:60000-60100 \
  --env-file .env.production \
  sabaipics-ftp-server
```

### Recommended Production Settings

```bash
FTP_LISTEN_ADDRESS=0.0.0.0:21
FTP_PASSIVE_PORT_START=60000
FTP_PASSIVE_PORT_END=60100
FTP_IDLE_TIMEOUT=600
FTP_DEBUG=false
TLS_CERT_PATH=/etc/letsencrypt/live/<domain>/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/<domain>/privkey.pem
IMPLICIT_FTPS_ENABLED=true
IMPLICIT_FTPS_PORT=0.0.0.0:990
```

## Notes

- Uploads are buffered to disk to set `Content-Length` (required by R2).
- Download, delete, and rename are blocked (upload-only).
- Implicit FTPS defaults to enabled; set `IMPLICIT_FTPS_ENABLED=false` to disable.
