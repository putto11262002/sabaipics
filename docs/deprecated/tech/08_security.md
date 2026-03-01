# Security Design

**Status:** Complete
**Last Updated:** 2025-12-04

---

## Overview

Security concerns for our system:

| Area                  | Risk Level   | Key Concerns                           |
| --------------------- | ------------ | -------------------------------------- |
| Face Data (Biometric) | **Critical** | PDPA compliance, consent, retention    |
| Photo Storage         | High         | Unauthorized access, enumeration       |
| Authentication        | High         | Session hijacking, credential stuffing |
| API Abuse             | Medium       | Rate limiting, DDoS                    |
| Input Validation      | Medium       | Injection, malicious uploads           |

---

## Critical Decision 1: PDPA Compliance (Thailand)

**Thailand PDPA (Personal Data Protection Act)** classifies face biometrics as **sensitive personal data** (Section 26).

**Legal requirements researched:** Sections 9, 19, 26, 28-29, 30-38, 37, 41-43. See research findings in task history.

### Compliance Model

| Requirement                              | Our Implementation                                 |
| ---------------------------------------- | -------------------------------------------------- |
| **Explicit consent** (Section 26)        | Two-stage consent: photographer + participant      |
| **Cross-border transfer** (Section 28)   | Disclosed in Privacy Policy (AWS Rekognition, USA) |
| **Purpose limitation**                   | "Match your face to event photos" only             |
| **Data minimization**                    | Only store face embeddings, not raw features       |
| **Retention limits** (Section 9)         | Auto-delete 1 month after event start              |
| **Data subject rights** (Sections 30-38) | Email-based, 30-day response                       |
| **Breach notification** (Section 37)     | 72 hours to PDPC, immediate to users               |
| **Security measures** (Section 37)       | Encryption in transit + at rest                    |

### Consent Flow - Photographer

**When:** During photographer registration (one-time)

| Step | Action                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Photographer signs up for account                                                                                                                                |
| 2    | Show checkbox (Thai + English): "I confirm I have obtained necessary consent from photographed individuals to upload and process their images. [Privacy Policy]" |
| 3    | Checkbox must be checked to complete registration                                                                                                                |
| 4    | Store consent record (photographer_id, timestamp, ip_address)                                                                                                    |

**Privacy Policy section:** Explains photographer's obligation to obtain consent from event participants before photographing.

### Consent Flow - Participant

**When:** Before each face search

| Step | Action                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------- |
| 1    | Participant uploads selfie for search                                                          |
| 2    | Show checkbox (Thai + English): "I consent to facial recognition processing. [Privacy Policy]" |
| 3    | Checkbox must be checked to proceed                                                            |
| 4    | Store consent record (participant_id, event_id, timestamp, ip_address)                         |
| 5    | Process face search                                                                            |

**Privacy Policy covers:**

- Facial recognition processing using AWS Rekognition
- Cross-border data transfer to USA (Section 28 compliance)
- Data retention: 1 month auto-delete
- Data subject rights process
- Contact: privacy@facelink.co

### Consent Records (Database)

**Photographer consent:**

| Field             | Purpose                     |
| ----------------- | --------------------------- |
| `photographer_id` | Who consented               |
| `consented_at`    | When (timestamp)            |
| `consent_type`    | `photographer_registration` |
| `ip_address`      | Audit trail                 |

**Participant consent:**

| Field            | Purpose          |
| ---------------- | ---------------- |
| `participant_id` | Who consented    |
| `event_id`       | Which event      |
| `consented_at`   | When (timestamp) |
| `consent_type`   | `face_search`    |
| `ip_address`     | Audit trail      |

**Retention:** All consent records kept for 3 years (legal requirement).

### Data Subject Rights (Sections 30-38)

**Response timeframe:** 30 days

| Right                | Implementation                                                          |
| -------------------- | ----------------------------------------------------------------------- |
| Access               | Email privacy@facelink.co → Provide data export (JSON)                  |
| Deletion             | Email privacy@facelink.co → Delete from Rekognition + DB within 30 days |
| Rectification        | Email privacy@facelink.co → Update incorrect data                       |
| Data portability     | Provide structured data export (JSON format)                            |
| Object to processing | Email privacy@facelink.co → Stop processing                             |
| Withdraw consent     | Email privacy@facelink.co → Delete data, block future processing        |

**Process:**

- Privacy Policy lists: "Contact privacy@facelink.co for data access, deletion, or other requests"
- Manual handling via email
- Log all requests and responses (compliance audit trail)

### Data Retention & Deletion

| Data                   | Retention                | Deletion Trigger                    |
| ---------------------- | ------------------------ | ----------------------------------- |
| Rekognition collection | 1 month from event start | Auto (daily cron job)               |
| Face records in DB     | 1 month from event start | Auto (daily cron job)               |
| Selfie (search input)  | Not stored               | Processed and discarded immediately |
| Consent records        | 3 years                  | Legal requirement (Section 9)       |
| Photo files (R2)       | 1 month from event start | Auto (daily cron job)               |

**On-demand deletion:**

- Participant can request immediate deletion via privacy@facelink.co
- Must delete within 30 days of request

### Cross-Border Transfer (Section 28-29)

**Transfer location:** USA (AWS Rekognition, us-west-2)

**Legal basis:** Explicit consent via Privacy Policy disclosure

**Privacy Policy must state:**

- "Your facial recognition data is processed using AWS Rekognition service located in USA"
- "By using face search, you consent to this cross-border data transfer"
- "Data is deleted within 1 month and protected with encryption"

**Alternative (if needed):** Obtain Standard Contractual Clauses (SCCs) from AWS

### Breach Notification (Section 37)

**To PDPC:** Within 72 hours of discovery (if poses risk to data subjects)

**To affected users:** Without undue delay (if high risk)

**Required information:**

- Nature of breach
- Data categories affected
- Likely consequences
- Measures taken to address breach

**Implementation:** See observability section for breach detection procedures

### Documents Required

| Document                         | Language       | Purpose                                                    |
| -------------------------------- | -------------- | ---------------------------------------------------------- |
| Privacy Policy                   | Thai + English | Explains all data processing, consent requirements, rights |
| Terms of Service (Photographers) | Thai + English | References Privacy Policy, photographer warranties         |
| Data Subject Request Log         | Thai/English   | Track all requests within 30-day response requirement      |
| Record of Processing Activities  | Thai/English   | PDPA Section 38-39 compliance                              |

### Data Protection Officer (DPO)

**Requirement:** Likely required (Section 41-43) - large-scale processing of sensitive biometric data

**Implementation:**

- Appoint DPO (can be founder initially, or external consultant)
- List DPO contact in Privacy Policy
- DPO oversees compliance, handles complaints, liaises with PDPC

### Penalties for Non-Compliance

**Administrative:** Up to 5,000,000 Baht (~$140,000 USD)

**Criminal:** Up to 1 year imprisonment

**Recent enforcement (Nov 2025):** World/Worldcoin ordered to delete 1.2 million biometric records and cease operations for:

- Consent not freely given
- Risk of unlawful cross-border transfer
- Insufficient security measures

---

## Critical Decision 2: Input Validation

### File Upload Validation

| Check               | Rule                                      | Layer      |
| ------------------- | ----------------------------------------- | ---------- |
| File extension      | `.jpg`, `.jpeg`, `.png`, `.heic`, `.webp` | API        |
| Magic bytes         | Verify actual file type matches extension | API        |
| File size           | Max 50MB                                  | API        |
| Content-Type header | Must match file type                      | API        |
| Image dimensions    | Min 100x100, Max 20000x20000              | Processing |
| Malware scan        | Optional - defer to post-MVP              | Future     |

**Magic byte verification:**

| Format | Magic Bytes                   |
| ------ | ----------------------------- |
| JPEG   | `FF D8 FF`                    |
| PNG    | `89 50 4E 47`                 |
| WebP   | `52 49 46 46` + `57 45 42 50` |
| HEIC   | `66 74 79 70 68 65 69 63`     |

### API Input Validation

| Input Type | Validation                             |
| ---------- | -------------------------------------- |
| UUIDs      | Strict UUID v4 format                  |
| Strings    | Max length, no null bytes              |
| Numbers    | Range validation                       |
| Dates      | ISO 8601 format                        |
| Arrays     | Max items limit                        |
| File paths | No traversal (`..`), no absolute paths |

### Validation Strategy

| Layer           | What                                  |
| --------------- | ------------------------------------- |
| Cloudflare WAF  | Block obvious attacks (SQLi patterns) |
| Hono middleware | Schema validation (Zod)               |
| Database        | Parameterized queries only            |

---

## Critical Decision 3: Rate Limiting

### Three-Layer Architecture

| Layer                      | Tool            | Enforcement                                                    | Use Case                                                 |
| -------------------------- | --------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| **Edge (per-IP)**          | Cloudflare WAF  | Per-IP limits (600/min search, 700/min block trigger)          | DDoS protection, volumetric attacks, anonymous endpoints |
| **Application (per-user)** | Durable Objects | Per-user limits (100/min upload, 10/min LINE)                  | Authenticated endpoints, credit abuse prevention         |
| **Audit Trail**            | Neon Postgres   | Permanent log of all requests (ip_address, user_id, timestamp) | Compliance, analytics, incident investigation            |

### Enforcement Patterns

**Per-IP limits (Cloudflare WAF):**

- Applied to: `POST /api/search`, `POST /api/auth/*`, `POST /api/webhooks/*`
- How: Cloudflare WAF counts requests by IP address
- Storage: Cloudflare edge (in-memory, distributed)
- Response: `429 Too Many Requests` with `Retry-After` header
- Reset: Sliding 1-minute window

**Per-user limits (Durable Objects):**

- Applied to: `POST /api/events/:id/photos`, `POST /api/line/send`
- How: One Durable Object instance per user (photographer or participant)
- Storage: In-memory array of timestamps, filtered on each request
- Lifecycle: Auto-evicted after 70-140 seconds idle (zero cost when idle)
- Coordination: Single-threaded per user (no race conditions)
- Response: `429 Too Many Requests` with `Retry-After` header
- Reset: Sliding 1-minute window (filter timestamps < now-60s)

**Why Durable Objects (not D1 or Workers KV):**

- D1: Too slow (5-20ms per query) for rate limit checks
- Workers KV: Eventual consistency breaks rate limiting (could allow bursts)
- Durable Objects: <1ms latency, strongly consistent, auto-evicts when idle

**Rate limit values per endpoint:** See `dev/tech/03_api_design.md` Critical Decision 9

### Cloudflare WAF Configuration

WAF rules complement application-layer rate limiting:

| Purpose           | Approach                                                       |
| ----------------- | -------------------------------------------------------------- |
| **Trigger level** | Set slightly above application limits to avoid false positives |
| **Action**        | Challenge (auth endpoints) or Block 1hr (abuse patterns)       |
| **Monitoring**    | Log all WAF triggers for incident review                       |

**Example configuration pattern:**

- If API limit is 600/min, set WAF trigger at ~700/min
- Allows legitimate bursts while catching abuse
- WAF acts as safety net, not primary enforcement

### Response When Limited

| Status | Header                   | Body                                                                  |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| 429    | `Retry-After: {seconds}` | `{"error": {"code": "RATE_LIMITED", "message": "Too many requests"}}` |

---

## Critical Decision 4: Access Control

### Resource Ownership

| Resource    | Owner Check                                           |
| ----------- | ----------------------------------------------------- |
| Event       | `event.photographer_id = current_user.id`             |
| Photo       | `photo.event.photographer_id = current_user.id`       |
| Access Code | `access_code.event.photographer_id = current_user.id` |
| Credits     | `credit_ledger.photographer_id = current_user.id`     |

### Access Rules

| Action                   | Rule                                  |
| ------------------------ | ------------------------------------- |
| View photo (participant) | Valid access code + event not expired |
| Download photo           | Valid access code OR owner            |
| Delete photo             | Owner only                            |
| Search faces             | Valid access code + consent given     |

### Defense in Depth

| Layer     | Check                              |
| --------- | ---------------------------------- |
| API Route | Auth middleware (Clerk JWT)        |
| Handler   | Resource ownership                 |
| Database  | Parameterized queries with user_id |

---

## Critical Decision 5: Signed URL Security

### R2 Signed URL Configuration

| Use Case                | Expiry | Method | Restrictions        |
| ----------------------- | ------ | ------ | ------------------- |
| Photo download          | 1 hour | GET    | Single object       |
| Photo upload (internal) | 5 min  | PUT    | Content-Type locked |

### Security Rules

| Rule                      | Why                         |
| ------------------------- | --------------------------- |
| Generate server-side only | Never expose signing keys   |
| Short expiration          | Limit window of abuse       |
| Single-use intent         | Don't allow method override |
| Log all generations       | Audit trail                 |

### URL Structure

| Component | Value                                       |
| --------- | ------------------------------------------- |
| Base      | `https://{bucket}.r2.cloudflarestorage.com` |
| Path      | `/{event_id}/{photo_id}.{ext}`              |
| Signature | HMAC-SHA256                                 |
| Expiry    | Unix timestamp                              |

---

## Critical Decision 6: Webhook Security

### Verification Requirements

| Provider     | Header             | Algorithm   |
| ------------ | ------------------ | ----------- |
| Clerk (Svix) | `svix-signature`   | HMAC-SHA256 |
| Stripe       | `stripe-signature` | HMAC-SHA256 |
| LINE         | `X-Line-Signature` | HMAC-SHA256 |

### Verification Steps

| Step | Action                                  |
| ---- | --------------------------------------- |
| 1    | Extract signature from header           |
| 2    | Get raw request body                    |
| 3    | Compute expected signature using secret |
| 4    | Constant-time compare signatures        |
| 5    | Verify timestamp (max 5 min old)        |
| 6    | Reject if invalid                       |

### Replay Protection

| Strategy            | Implementation              |
| ------------------- | --------------------------- |
| Timestamp check     | Reject webhooks > 5 min old |
| Idempotency         | Store processed webhook IDs |
| Idempotent handlers | Operations safe to repeat   |

### Secret Storage

| Secret                  | Location           |
| ----------------------- | ------------------ |
| `CLERK_WEBHOOK_SECRET`  | Cloudflare Secrets |
| `STRIPE_WEBHOOK_SECRET` | Cloudflare Secrets |
| `LINE_CHANNEL_SECRET`   | Cloudflare Secrets |

---

## Critical Decision 7: CORS Configuration

### Allowed Origins

| App         | Origin                    | Credentials    |
| ----------- | ------------------------- | -------------- |
| Dashboard   | `https://app.facelink.co` | Yes            |
| Participant | `https://get.facelink.co` | Yes            |
| Desktop     | `tauri://localhost`       | Yes            |
| Development | `http://localhost:*`      | Yes (dev only) |

### Headers

| Header                             | Value                               |
| ---------------------------------- | ----------------------------------- |
| `Access-Control-Allow-Origin`      | Specific origin (not `*`)           |
| `Access-Control-Allow-Methods`     | `GET, POST, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers`     | `Content-Type, Authorization`       |
| `Access-Control-Allow-Credentials` | `true`                              |
| `Access-Control-Max-Age`           | `86400` (1 day)                     |

### Rules

| Rule                         | Why                     |
| ---------------------------- | ----------------------- |
| No wildcard with credentials | Browser security policy |
| Validate origin server-side  | Prevent spoofing        |
| Preflight caching            | Reduce OPTIONS requests |

---

## Critical Decision 8: Secrets Management

### Where Secrets Live

| Environment | Storage                       |
| ----------- | ----------------------------- |
| Production  | Cloudflare Secrets            |
| Staging     | Cloudflare Secrets (separate) |
| Development | `.dev.vars` (gitignored)      |

### Required Secrets

| Secret                      | Used For             |
| --------------------------- | -------------------- |
| `CLERK_SECRET_KEY`          | JWT verification     |
| `CLERK_WEBHOOK_SECRET`      | Webhook verification |
| `STRIPE_SECRET_KEY`         | Payment processing   |
| `STRIPE_WEBHOOK_SECRET`     | Webhook verification |
| `LINE_CHANNEL_SECRET`       | Webhook verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | Push messages        |
| `AWS_ACCESS_KEY_ID`         | Rekognition          |
| `AWS_SECRET_ACCESS_KEY`     | Rekognition          |
| `R2_ACCESS_KEY_ID`          | R2 operations        |
| `R2_SECRET_ACCESS_KEY`      | R2 operations        |

### Rotation Policy

| Secret Type     | Rotation                |
| --------------- | ----------------------- |
| API keys        | 90 days                 |
| Webhook secrets | On suspected compromise |
| AWS credentials | 90 days                 |

---

## Critical Decision 9: Audit Logging

### What We Log

| Event          | Fields                                     | Retention |
| -------------- | ------------------------------------------ | --------- |
| Photo upload   | user_id, event_id, photo_id, timestamp     | 90 days   |
| Photo download | user_id, event_id, photo_id, ip, timestamp | 90 days   |
| Face search    | event_id, ip, result_count, timestamp      | 90 days   |
| Login success  | user_id, ip, timestamp                     | 90 days   |
| Login failure  | attempted_email, ip, timestamp             | 90 days   |
| Consent given  | user_id, event_id, consent_type, timestamp | 3 years   |
| Data deletion  | user_id, data_type, timestamp              | 3 years   |

### Log Storage

| Type                                        | Destination                  | Rationale                                                                        |
| ------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| **Audit trail (deliveries, notifications)** | **Neon Postgres**            | Permanent business data, compliance, reporting. Part of primary database schema. |
| **Rate limiting counters**                  | **Durable Objects**          | Temporary in-memory, auto-evicted after idle. Not logged permanently.            |
| Application logs                            | Cloudflare Logpush → Grafana | Operational monitoring, debugging                                                |
| Access logs                                 | Cloudflare Analytics         | Traffic analytics, CDN performance                                               |

**Separation of concerns:**

- **Audit logs** (permanent): Stored in Neon Postgres alongside business data (deliveries, line_notifications tables)
- **Rate limiting** (temporary): In-memory in Durable Objects, discarded after sliding window expires
- Rate limit violations are logged to audit trail in Postgres for compliance

### PII in Logs

| Rule         | Implementation             |
| ------------ | -------------------------- |
| No passwords | Never log credentials      |
| Hash IPs     | Store hashed for analytics |
| Mask emails  | `u***@domain.com` in logs  |
| No face data | Never log biometric data   |

---

## Critical Decision 10: OWASP Top 10 Mitigations

### A01: Broken Access Control

| Risk                              | Mitigation                                 |
| --------------------------------- | ------------------------------------------ |
| Photographer sees others' events  | Filter by `photographer_id` in all queries |
| Participant accesses wrong photos | Validate access code per request           |
| Direct object reference           | Check ownership before every operation     |

### A02: Cryptographic Failures

| Risk            | Mitigation                            |
| --------------- | ------------------------------------- |
| Data in transit | TLS 1.3 (Cloudflare enforces)         |
| Data at rest    | D1 encrypted, R2 encrypted by default |
| Weak hashing    | Use bcrypt/argon2 if we hash anything |

### A03: Injection

| Risk              | Mitigation                               |
| ----------------- | ---------------------------------------- |
| SQL injection     | Parameterized queries only (D1 bindings) |
| NoSQL injection   | N/A (using SQL)                          |
| Command injection | No shell execution                       |

### A04: Insecure Design

| Risk                | Mitigation                        |
| ------------------- | --------------------------------- |
| Missing rate limits | Implemented at edge + application |
| No abuse controls   | Credit system limits uploads      |

### A05: Security Misconfiguration

| Risk                  | Mitigation                        |
| --------------------- | --------------------------------- |
| Debug mode in prod    | Environment-based config          |
| Default credentials   | No defaults, all secrets required |
| Exposed error details | Generic errors to client          |

### A06: Vulnerable Components

| Risk                  | Mitigation                 |
| --------------------- | -------------------------- |
| Outdated dependencies | Monthly `npm audit`        |
| Lock file attacks     | Commit `package-lock.json` |

### A07: Authentication Failures

| Risk                | Mitigation                                    |
| ------------------- | --------------------------------------------- |
| Weak passwords      | Clerk handles (no passwords for participants) |
| Session hijacking   | Short session expiry, secure cookies          |
| Credential stuffing | Rate limiting on auth endpoints               |

### A08: Data Integrity Failures

| Risk              | Mitigation                    |
| ----------------- | ----------------------------- |
| Unsigned webhooks | Verify all webhook signatures |
| Unsigned updates  | N/A (no auto-updates)         |

### A09: Logging Failures

| Risk           | Mitigation                                        |
| -------------- | ------------------------------------------------- |
| No audit trail | Comprehensive logging (Decision 9)                |
| Log injection  | Structured logging, no user input in log messages |

### A10: SSRF

| Risk                    | Mitigation                         |
| ----------------------- | ---------------------------------- |
| User-controlled URLs    | Only accept file uploads, not URLs |
| Internal network access | Workers have no internal network   |

---

## Implementation Phases

### Phase 1: MVP

- Input validation (file type, size)
- Rate limiting (Cloudflare WAF basic rules)
- CORS configuration
- Webhook signature verification
- Secrets in Cloudflare Secrets
- Basic audit logging

### Phase 2: Post-MVP

- PDPA consent management
- Enhanced rate limiting (per-user quotas)
- Magic byte verification
- Comprehensive audit logging
- Security monitoring alerts

### Phase 3: Scale

- Malware scanning for uploads
- Advanced bot protection
- Security incident response plan
- Regular penetration testing
- SOC 2 preparation (if enterprise)

---

## References

- `dev/tech/02_auth.md` - Auth patterns
- `dev/tech/03_api_design.md` - API security (auth, rate limits)
- `dev/tech/00_business_rules.md` - Rate limit values
- Thailand PDPA Act (2019, enforced 2022)
- OWASP Top 10 (2021)
- Cloudflare Security Best Practices
