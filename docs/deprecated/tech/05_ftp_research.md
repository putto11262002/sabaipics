# SFTPGo FTP/FTPS Research & HTTPFs Backend

**Date:** 2025-12-07
**Status:** Research Complete
**Purpose:** Understanding SFTPGo responsibilities vs our implementation needs

---

## Executive Summary

**What SFTPGo Handles:**
- Full FTP/FTPS server (RFC 959, all commands)
- TLS encryption, passive mode, connection management
- External authentication hook (validates against our API)
- HTTPFs virtual filesystem (proxies all file ops to HTTP endpoints)
- Built-in metrics, logging, brute force protection

**What We Must Implement:**
- `POST /ftp/auth` - Validate credentials, return user object
- HTTPFs API (`/ftp/v1/*`) - 13 endpoints for file operations
- Business logic (access control, quotas, validation)
- API key management for HTTPFs backend

---

## 1. SFTPGo FTP Implementation

### Supported Commands (Out of Box)

**Standard FTP (RFC 959):**
- USER, PASS - Authentication
- CWD, PWD - Navigation  
- LIST, NLST - Listing
- STOR, RETR - Upload/Download
- DELE, MKD, RMD, RNFR, RNTO - File operations

**Extensions:**
- AUTH/PROT - TLS (RFC 2228, 4217)
- EPRT/EPSV - IPv6 (RFC 2428)
- MDTM, SIZE, REST - File info & resume (RFC 3659)
- MLST/MLSD - Machine listings (RFC 3659)
- HASH, AVLB, COMB - Hashing, space, multi-part

### Passive Mode

```
1. Client → PASV command
2. SFTPGo opens port from range (50000-50100)
3. SFTPGo → "227 Entering Passive Mode (IP,port)"
4. Client connects to that port
5. Data flows through client-initiated connection
```

**Config:**
```json
{
  "ftpd": {
    "passive_port_range": {"start": 50000, "end": 50100},
    "force_passive_ip": "203.0.113.1"  // For NAT
  }
}
```

**Firewall:** Must allow 21/tcp + 50000-50100/tcp

### FTPS Modes

**Explicit FTPS (Recommended):**
- Port 21, client sends `AUTH TLS`
- Upgrade to TLS after connection
- `tls_mode: 1`

**Implicit FTPS (Legacy):**
- Port 990, TLS from start
- `tls_mode: 2`

---

## 2. HTTPFs Backend - Virtual Filesystem

### How It Works

```
FTP Client → SFTPGo → HTTP Calls → Our API → R2 Storage
```

SFTPGo translates FTP commands to HTTP requests:

| FTP Command | HTTP Call |
|------------|-----------|
| STOR file.jpg | `POST /ftp/v1/create/file.jpg` (body: binary) |
| RETR file.jpg | `GET /ftp/v1/open/file.jpg` |
| LIST /dir | `GET /ftp/v1/readdir/dir` |
| DELE file.jpg | `DELETE /ftp/v1/remove/file.jpg` |
| MKD /newdir | `POST /ftp/v1/mkdir/newdir` |
| RNF old TO new | `PATCH /ftp/v1/rename/old?target=new` |

### Required HTTPFs Endpoints

**Essential (Must implement):**
1. `GET /stat/{path}` - File metadata
2. `GET /open/{path}?offset=N` - Download file
3. `POST /create/{path}?flags=N` - Upload file
4. `DELETE /remove/{path}` - Delete file/dir
5. `POST /mkdir/{path}` - Create directory
6. `PATCH /rename/{path}?target=X` - Move/rename
7. `GET /readdir/{path}` - List directory

**Optional (Can return 501):**
8. `PATCH /chmod/{path}?mode=N` - Change permissions
9. `PATCH /chtimes/{path}?...` - Change timestamps
10. `PATCH /truncate/{path}?size=N` - Resize file
11. `GET /dirsize/{path}` - Directory size
12. `GET /mimetype/{path}` - MIME type
13. `GET /statvfs/{path}` - Filesystem stats

### Request/Response Examples

**stat - Get File Info:**
```http
GET /ftp/v1/stat/event123/photo.jpg
X-API-KEY: secret

Response 200:
{
  "name": "photo.jpg",
  "size": 2048576,
  "mode": 0,  // Regular file
  "last_modified": "2025-12-07T10:30:00Z"
}
```

**open - Download File:**
```http
GET /ftp/v1/open/event123/photo.jpg?offset=0
X-API-KEY: secret

Response 200:
Content-Type: image/jpeg
Content-Length: 2048576
<binary data>
```

**create - Upload File:**
```http
POST /ftp/v1/create/event123/photo.jpg?flags=66
X-API-KEY: secret
Content-Type: application/octet-stream
<binary data>

Response 201:
(empty body)
```

**readdir - List Directory:**
```http
GET /ftp/v1/readdir/event123

Response 200:
[
  {
    "name": "photo1.jpg",
    "size": 1024000,
    "mode": 0,
    "last_modified": "2025-12-07T09:00:00Z"
  },
  {
    "name": "subdir",
    "size": 0,
    "mode": 2147483648,  // Directory (bit 31 set)
    "last_modified": "2025-12-07T08:00:00Z"
  }
]
```

### Error Mapping

| HTTP Status | FTP Meaning |
|------------|-------------|
| 200/201 | Success |
| 401 | Not authorized (invalid API key) |
| 403 | Permission denied |
| 404 | Not found |
| 500 | Internal error |
| 501 | Not implemented |

### File Mode Flags

- Regular file: `mode: 0` (or `mode & 2401763328 == 0`)
- Directory: `mode: 2147483648` (bit 31 set)
- Symlink: `mode: 134217728` (bit 27 set)

---

## 3. External Auth Hook

### How It Works

```
1. FTP client → USER username, PASS password
2. SFTPGo → POST /ftp/auth {username, password, ip}
3. Our API validates credentials
4. Our API → 200 + user object OR 401
5. SFTPGo grants/denies access
```

### Hook Configuration

```json
{
  "common": {
    "external_auth_hook": "http://api.sabaipics.com/ftp/auth",
    "external_auth_scope": 1  // 1=password only
  }
}
```

### Auth Request

```http
POST /ftp/auth
Content-Type: application/json

{
  "username": "photographer123",
  "password": "secret-password",
  "ip": "203.0.113.45",
  "protocol": "FTP"
}
```

Fields sent by SFTPGo:
- `username`, `password` - Credentials
- `ip` - Client IP
- `protocol` - "SSH", "FTP", "DAV", "HTTP"
- `user` - Existing user object if cached (optional)
- `public_key`, `keyboard_interactive`, `tls_cert` - For other auth types

### Auth Response

**Success - Return User Object:**
```http
200 OK
Content-Type: application/json

{
  "status": 1,
  "username": "photographer123",
  "home_dir": "/events",
  "permissions": {
    "/": ["*"],
    "/events/event123": ["list", "download", "upload", "delete", "rename", "create_dirs"]
  },
  "filesystem": {
    "provider": 6,  // HTTPFs
    "httpconfig": {
      "endpoint": "http://api.sabaipics.com/ftp/v1",
      "api_key": "user-specific-api-key"
    }
  },
  "external_auth_cache_time": 3600
}
```

**Success - Use Existing User:**
```http
200 OK
Content-Length: 0
```

**Failure:**
```http
401 Unauthorized

{"username": ""}
```

### User Object Structure

**Key Fields:**
- `status` - 1=enabled, 0=disabled
- `username` - Unique username
- `home_dir` - Virtual root (e.g., "/events")
- `permissions` - Map of path → permission array
- `filesystem.provider` - 6 for HTTPFs
- `filesystem.httpconfig.endpoint` - Our API base URL
- `filesystem.httpconfig.api_key` - Auth for HTTPFs endpoints
- `external_auth_cache_time` - Cache duration (seconds)

**Permission Values:**
- `*` - All permissions
- `list`, `download`, `upload`, `overwrite`, `delete`
- `rename`, `create_dirs`, `create_symlinks`
- `chmod`, `chown`, `chtimes`

---

## 4. Responsibility Breakdown

### SFTPGo Handles (Out of Box)

**Protocol:**
- ✅ Full FTP/FTPS server (RFC 959 + extensions)
- ✅ All FTP commands (STOR, RETR, LIST, etc.)
- ✅ Passive/active mode
- ✅ TLS encryption (explicit/implicit)
- ✅ Transfer resumption (REST)
- ✅ IPv6 support

**Connection:**
- ✅ Client connection handling
- ✅ Session management
- ✅ Connection limits
- ✅ Timeout handling
- ✅ Proxy protocol

**Security:**
- ✅ TLS/SSL
- ✅ Password hashing
- ✅ Auth delegation
- ✅ IP filtering
- ✅ Brute force protection (Defender)
- ✅ Rate limiting

**Users:**
- ✅ Virtual users
- ✅ User caching
- ✅ Per-user permissions
- ✅ Per-user quotas
- ✅ Virtual folders
- ✅ Groups

**Observability:**
- ✅ Prometheus metrics
- ✅ Event logging
- ✅ Connection tracking
- ✅ Transfer statistics
- ✅ Web UI dashboard

### We Must Implement

**Authentication API:**
- ❌ `POST /ftp/auth` - Validate credentials
- ❌ Map photographer → event permissions
- ❌ Generate user object with HTTPFs config
- ❌ Generate API keys for HTTPFs

**HTTPFs API:**
- ❌ `GET /stat/{path}` - File metadata from R2
- ❌ `GET /open/{path}` - Stream download from R2
- ❌ `POST /create/{path}` - Upload to R2
- ❌ `DELETE /remove/{path}` - Delete from R2
- ❌ `POST /mkdir/{path}` - Create virtual directory
- ❌ `PATCH /rename/{path}` - Move/rename in R2
- ❌ `GET /readdir/{path}` - List R2 directory

**Business Logic:**
- ❌ Photographer authentication
- ❌ Event access control
- ❌ Path mapping (virtual → R2 keys)
- ❌ Quota enforcement
- ❌ Audit logging
- ❌ File validation (type, size)

**API Key Management:**
- ❌ Generate keys
- ❌ Validate keys in HTTPFs endpoints
- ❌ Map key → photographer → events

---

## 5. Configuration

### Minimal SFTPGo Config

```json
{
  "common": {
    "idle_timeout": 15,
    "external_auth_hook": "http://api.sabaipics.com/ftp/auth",
    "external_auth_scope": 1,
    "defender": {
      "enabled": true,
      "ban_time": 30,
      "threshold": 15
    }
  },
  "ftpd": {
    "bindings": [{
      "port": 2121,
      "tls_mode": 1,
      "certificate_file": "/etc/sftpgo/certs/cert.pem",
      "certificate_key_file": "/etc/sftpgo/certs/key.pem",
      "min_tls_version": 12,
      "force_passive_ip": "203.0.113.1"
    }],
    "passive_port_range": {
      "start": 50000,
      "end": 50100
    }
  },
  "data_provider": {
    "driver": "sqlite"
  }
}
```

### Environment Variables

```bash
SFTPGO_COMMON__EXTERNAL_AUTH_HOOK=http://api.sabaipics.com/ftp/auth
SFTPGO_COMMON__EXTERNAL_AUTH_SCOPE=1
SFTPGO_FTPD__BINDINGS__0__PORT=2121
SFTPGO_FTPD__BINDINGS__0__TLS_MODE=1
SFTPGO_FTPD__BINDINGS__0__FORCE_PASSIVE_IP=203.0.113.1
SFTPGO_FTPD__PASSIVE_PORT_RANGE__START=50000
SFTPGO_FTPD__PASSIVE_PORT_RANGE__END=50100
```

---

## 6. Implementation Roadmap

### Phase 1: External Auth API
1. Create `POST /ftp/auth` endpoint
2. Validate photographer credentials from DB
3. Generate user object with event permissions
4. Return HTTPFs config with API key

### Phase 2: HTTPFs Read-Only
1. Implement `GET /stat/{path}`
2. Implement `GET /readdir/{path}`
3. Implement `GET /open/{path}`
4. Test downloads with FTP client

### Phase 3: HTTPFs Write
1. Implement `POST /create/{path}` - Upload to R2
2. Implement `DELETE /remove/{path}`
3. Implement `POST /mkdir/{path}`
4. Implement `PATCH /rename/{path}`
5. Test uploads with FTP client

### Phase 4: SFTPGo Deployment
1. Deploy SFTPGo container
2. Configure external auth hook
3. Configure FTPS certificates
4. Configure passive IP/ports
5. Open firewall ports

### Phase 5: Testing & Hardening
1. Test with FileZilla, WinSCP
2. Test passive mode through NAT
3. Load testing (concurrent uploads)
4. Security audit
5. Rate limiting & quotas

---

## 7. Security Considerations

### Authentication
- Use external hook (don't store passwords in SFTPGo)
- Cache auth for 1 hour
- Rotate API keys periodically

### Authorization
- Photographer can only access assigned events
- Enforce paths in HTTPFs API (prevent traversal)

### Network
- Always use FTPS (TLS 1.2+)
- Configure `force_passive_ip` for NAT
- Firewall passive port range

### Rate Limiting
- Enable SFTPGo Defender
- Max concurrent sessions per user
- API-level upload limits

### Validation
- Validate file types in `/create`
- Reject non-images
- Enforce file size limits
- Sanitize filenames

---

## 8. Path Mapping Example

**FTP Client View:**
```
/
├── event123/
│   ├── photo1.jpg
│   └── photo2.jpg
└── event456/
    └── photo3.jpg
```

**Our API Receives:**
```
GET /ftp/v1/stat/event123/photo1.jpg
GET /ftp/v1/readdir/event123
POST /ftp/v1/create/event123/photo2.jpg
```

**R2 Keys:**
```
events/event123/photo1.jpg
events/event123/photo2.jpg
events/event456/photo3.jpg
```

---

## References

- [SFTPGo Docs](https://docs.sftpgo.com/latest/)
- [HTTPFs API Spec](https://github.com/drakkan/sftpgo/blob/main/openapi/httpfs.yaml)
- [External Auth](https://docs.sftpgo.com/latest/external-auth/)
- [FTP Protocol](https://docs.sftpgo.com/latest/ftp/)
- [Config Reference](https://docs.sftpgo.com/latest/config-file/)
