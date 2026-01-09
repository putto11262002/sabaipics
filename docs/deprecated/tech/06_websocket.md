# WebSocket Design

**Status:** Complete
**Last Updated:** 2025-12-04

---

## Overview

Real-time notifications for photographer dashboard using Cloudflare Durable Objects.

**Use case:** Notify photographer when photos finish processing.

**Flow:** Queue Consumer → RPC → Durable Object → WebSocket → Dashboard

---

## Critical Decision 1: One DO Per Photographer

**Pattern:** `idFromName(photographerId)`

| Approach | Result |
|----------|--------|
| `idFromName("photographer-123")` | Always routes to same DO instance globally |
| Multiple tabs | Same photographer, same DO, multiple WebSocket connections |

**Why:** Photographer dashboard needs real-time updates. One DO holds all their connections.

---

## Critical Decision 2: Connection Flow

| Step | Component | Action |
|------|-----------|--------|
| 1 | Client | `GET /ws?token=xxx` with `Upgrade: websocket` header |
| 2 | Worker | Validate Clerk token, extract photographerId |
| 3 | Worker | `env.NOTIFIER.idFromName(photographerId)` |
| 4 | Worker | Forward request to DO |
| 5 | DO | Create WebSocketPair |
| 6 | DO | `ctx.acceptWebSocket(server)` |
| 7 | DO | `ws.serializeAttachment({ connectionId, photographerId })` |
| 8 | DO | Store in Map: `connectionId → ws` |
| 9 | DO | Return client side (status 101) |

**Auth happens in Worker** before WebSocket upgrade. DO trusts the connection.

---

## Critical Decision 3: Hibernation API

**Why Hibernation:**

| Without | With |
|---------|------|
| 50 idle photographers = paying GB-seconds | DO evicts, connections stay |
| Cost scales with connections | Cost scales with activity |

**How it works:**

| Event | What Happens |
|-------|--------------|
| Idle (few minutes) | DO evicts from memory |
| Eviction | In-memory Map LOST, WebSocket connections remain |
| Message arrives / RPC called | DO reconstructs |
| Constructor runs | Map is empty |
| Reconstruct | `ctx.getWebSockets()` + `deserializeAttachment()` |

**Attachment pattern:**

| Method | Purpose |
|--------|---------|
| `ws.serializeAttachment(data)` | Persist metadata with WebSocket (max 2KB) |
| `ws.deserializeAttachment()` | Retrieve on wake |

**What we store in attachment:**

| Field | Purpose |
|-------|---------|
| `connectionId` | Unique ID for this connection |
| `photographerId` | Owner of this connection |
| `connectedAt` | Timestamp |

---

## Critical Decision 4: State Reconstruction

**On wake (after hibernation):**

| Step | Action |
|------|--------|
| 1 | Constructor runs (Map empty) |
| 2 | Call `ctx.getWebSockets()` to get all connected ws objects |
| 3 | For each ws: `deserializeAttachment()` |
| 4 | Rebuild Map: `connectionId → ws` |

**When to reconstruct:**
- In `webSocketMessage()` handler
- In RPC methods before broadcasting
- NOT in constructor (async not allowed)

---

## Critical Decision 5: External Triggers (RPC)

**Any Worker can notify connected clients via RPC.**

| Step | Component | Action |
|------|-----------|--------|
| 1 | Queue Consumer | Photo processed |
| 2 | Queue Consumer | `env.NOTIFIER.idFromName(photographerId)` |
| 3 | Queue Consumer | `await stub.notifyPhotoReady({ photoId, status })` |
| 4 | DO | RPC method executes |
| 5 | DO | Reconstruct Map if needed |
| 6 | DO | Broadcast to all connections |

**RPC wakes hibernated DO.** No special handling needed.

---

## Critical Decision 6: Message Types

| Type | Direction | Payload | When |
|------|-----------|---------|------|
| `photo.processing` | Server → Client | `{ photoId, eventId }` | Photo enters queue |
| `photo.ready` | Server → Client | `{ photoId, eventId, faceCount }` | Processing complete |
| `photo.failed` | Server → Client | `{ photoId, eventId, error }` | Processing failed |
| `event.stats` | Server → Client | `{ eventId, photoCount, faceCount }` | Stats updated |
| `ping` | Client → Server | `{}` | Keep-alive |
| `pong` | Server → Client | `{}` | Keep-alive response |

---

## Critical Decision 7: Client Reconnection

**WebSocket may disconnect.** Client must handle reconnection.

| Strategy | Detail |
|----------|--------|
| Auto-reconnect | Exponential backoff (1s, 2s, 4s, ... max 30s) |
| Re-identify | On connect, send auth token |
| Idempotent UI | Handle duplicate messages gracefully |

---

## Critical Decision 8: Wrangler Configuration

**Durable Object binding:**

| Setting | Value |
|---------|-------|
| Binding name | `NOTIFIER` |
| Class name | `PhotographerNotifier` |

**Queue consumer needs access to same binding** to call RPC.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Photographer Dashboard (Browser)                         │
│                                                          │
│ WebSocket ──────────────────────────────────────────┐   │
└─────────────────────────────────────────────────────│───┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────┐
│ Worker: API                                              │
│                                                          │
│ Route: GET /ws                                           │
│ 1. Validate Clerk token                                  │
│ 2. Get DO stub: idFromName(photographerId)               │
│ 3. Forward to DO                                         │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Durable Object: PhotographerNotifier                     │
│                                                          │
│ State:                                                   │
│ - connections: Map<connectionId, WebSocket>              │
│                                                          │
│ Methods:                                                 │
│ - fetch() → Accept WebSocket                             │
│ - webSocketMessage() → Handle client messages            │
│ - webSocketClose() → Cleanup                             │
│ - notifyPhotoReady() → RPC, broadcast to clients         │
│ - notifyPhotoFailed() → RPC, broadcast error             │
└────────────────────────────▲────────────────────────────┘
                             │
                             │ RPC: notifyPhotoReady()
                             │
┌────────────────────────────┴────────────────────────────┐
│ Worker: Queue Consumer                                   │
│                                                          │
│ 1. Receive photo_processed message                       │
│ 2. Get DO stub: idFromName(photographerId)               │
│ 3. Call stub.notifyPhotoReady({ photoId, status })       │
└─────────────────────────────────────────────────────────┘
```

---

## Cost Estimate

| Scenario | Estimate |
|----------|----------|
| 50 concurrent photographers | < $10/month |
| Hibernation enabled | Only pay for active processing |
| RPC calls | ~1 per photo processed |

---

## References

| Topic | Reference |
|-------|-----------|
| Deep research | `dev/research/durable_objects_websocket.md` |
| Primary doc (flows) | `00_flows.md` Flow 4, Step 15 |
| Primary doc (use cases) | `00_use_cases.md` S1 Step 8 |
| Official: WebSockets | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ |
| Official: Hibernation | https://developers.cloudflare.com/durable-objects/api/websockets/#primitives |
| Official: RPC | https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-from-a-worker/ |
