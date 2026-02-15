# SabaiPics Studio - iOS Architecture

## Overview

iOS app for professional photographers to capture and sync event photos to SabaiPics platform.

**Role:** Conduit, not storage. Buffer photos until synced to server.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         iOS device (SabaiPics Studio)                      │
│                                                                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│   │   Auth   │───▶│  Event   │───▶│  Camera  │───▶│   Sync   │     │
│   │ (Clerk)  │    │ Selection│    │  Capture │    │ (Upload) │     │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
        │                 │                │                │
        ▼                 ▼                ▼                ▼
   SabaiPics API    SabaiPics API    Canon/Nikon/    SabaiPics API
   (identity)       (events)         Sony Camera     (upload)
```

---

## Core Flow

```
1. Auth (Clerk)      → Photographer signs in
2. Select Event      → Choose which event to shoot
3. Connect Camera    → WiFi PTP/IP connection
4. Capture           → Photos transfer camera → iOS device
5. Sync              → Photos upload iOS device → Server
6. Purge             → Delete local after confirmed upload
```

---

## Three Pillars

### 1. Authentication (Clerk)

Photographer identity via Clerk iOS SDK.

- Sign in / sign out
- Session management
- API authentication headers

### 2. Event Selection

Fetch and display photographer's assigned events.

- List events from API
- Select active event before capture
- Event context for uploads

### 3. File Sync

iOS device as transient buffer between camera and server.

```
Camera ──(PTP/IP)──▶ iOS device ──(API)──▶ Server
                      │
                      └── Local buffer (unuploaded only)
                          Purge after server confirms receipt
```

**Key principle:** No local photo library. Only hold what hasn't synced yet.

**Storage direction:** App Documents directory (excluded from iCloud backup). Private, persistent, app-controlled.

**Queue tracking:** SQLite (likely GRDB) for upload state - crash-safe, queryable.

**Upload protocol direction:** Presigned URL to R2 (Cloudflare storage).

```
iOS device → API:  "Photo ready for event X"
API → iOS device:  Presigned R2 URL
iOS device → R2:   Direct upload
iOS device → API:  "Complete, confirm"
API:         Triggers processing, iOS device purges local
```

**Offline behavior:** Queue accumulates, drains when back online. Network monitored via `NWPathMonitor`.

**Background sync:** iOS Background URLSession - system manages uploads even if app suspended/killed.

---

## Subsystems

| Subsystem     | Purpose                | Details                      |
| ------------- | ---------------------- | ---------------------------- |
| PTP/IP Camera | Wireless photo capture | See `PTP_IP_ARCHITECTURE.md` |
| Cloud Sync    | Auth + Events + Upload | TBD                          |

---

## Navigation Shell

Studio uses a tab-based app shell, while keeping capture as a full-screen mode.

- App shell + capture mode: `IOS/APP_SHELL.md`
- Auth details: `IOS/AUTH.md`
- Design system: `IOS/THEME.md`

---

## Open Questions

- Retry strategy: Exponential backoff? Max attempts?
- Conflict handling: What if same photo uploaded twice?
- Progress UX: How to show sync status during capture?
- Event switching: Can photographer switch mid-session? What happens to queued photos?
- Storage limits: Max local buffer size? What if device full?
- API contract: Event list schema, upload confirmation protocol
