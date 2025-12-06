# Durable Objects + WebSocket Research

**Status:** Complete
**Date:** 2025-12-04
**Purpose:** Deep technical understanding for real-time notifications

---

## Context

We need real-time notifications: Queue Consumer (photo processed) → WebSocket → Photographer Dashboard

---

## 1. Durable Objects Fundamentals

### What IS a Durable Object?

- **Globally unique instance** of a class, addressable by ID or name
- **Single-threaded execution** - no race conditions within a DO
- **Persistent storage** - SQLite database survives evictions
- **Strong consistency** - same ID routes to same instance worldwide

**Key insight:** One DO instance per ID, globally. `idFromName("photographer-123")` always routes to the same instance.

### Lifecycle

| Event | What Happens |
|-------|--------------|
| First request/RPC | DO spins up |
| Receives alarm | DO wakes |
| WebSocket message (hibernating) | DO reconstructs |
| Idle (few minutes) | DO evicts from memory |
| Eviction | In-memory state LOST, storage persists |

### Memory Model

| Type | Behavior |
|------|----------|
| In-Memory (Maps, Sets, fields) | Fast, LOST on eviction |
| Storage (SQLite) | Persists, survives eviction |

**Critical:** WebSocket connection management relies on in-memory state. Must handle reconstruction.

---

## 2. WebSocket in Durable Objects

### WebSocketPair

Creates TWO ends of a single connection:
- **Server side** - accepted by DO
- **Client side** - returned to browser in Response

Flow:
1. Worker receives HTTP request with `Upgrade: websocket`
2. Worker creates WebSocketPair
3. Worker accepts server side in DO
4. Worker returns client side to browser (status 101)

### Two APIs

| API | Hibernation Support | Recommended |
|-----|---------------------|-------------|
| Native DO WebSocket API | Yes | **Yes** |
| Web Standard WebSocket API | No | No |

**Native API methods:**
- `ctx.acceptWebSocket(server)` - accept connection
- `webSocketMessage(ws, message)` - handle incoming
- `webSocketClose(ws, code, reason, wasClean)` - handle disconnect

### Hibernation API

**Problem without hibernation:**
- 1,000 idle connections = paying for GB-seconds
- Cost balloons

**With Hibernation API:**
- DO evicts when idle
- WebSocket connections remain connected to Cloudflare network
- Message arrives → DO reconstructs → handles it
- **Cost drops dramatically**

**The catch:** In-memory state lost on eviction. Solution: `serializeAttachment()`

### Attachment Pattern

```
ws.serializeAttachment({
  clientId: 'xxx',
  photographerId: 'yyy',
  connectedAt: Date.now()
});

// Later, after hibernation wake:
const metadata = ws.deserializeAttachment();
```

**Constraint:** Max 2,048 bytes per WebSocket attachment.

---

## 3. Connection Management

### Routing to Specific DO

| Method | Use Case |
|--------|----------|
| `idFromName(photographerId)` | Deterministic - same photographer always gets same DO |
| `newUniqueId()` | Transient - each call creates new ID |
| `getByName(name)` | Shorthand for idFromName + get |

**Our use case:** `idFromName(photographerId)` - one DO per photographer.

### Maintaining Connected Clients

**Problem:** In-memory Map lost on hibernation.

**Solution pattern:**
1. Track connections in Map (fast access)
2. Persist connection metadata to SQLite (survives hibernation)
3. On wake, reconstruct Map from SQLite
4. Use `serializeAttachment()` on each WebSocket

### Reconnection

WebSocket may disconnect during hibernation from browser's perspective.

**Client-side pattern:**
- Auto-reconnect with exponential backoff
- On reconnect, send identify message
- Server re-registers connection

---

## 4. External Triggers (Queue → DO)

### The Pattern: RPC

Any public method on DO class is callable via RPC from another Worker.

**Queue Consumer:**
```
const doStub = env.PHOTO_NOTIFIER.get(
  env.PHOTO_NOTIFIER.idFromName(photographerId)
);
await doStub.notifyPhotoReady({ photoId, status });
```

**Durable Object:**
```
async notifyPhotoReady(payload) {
  // Broadcast to all connected WebSocket clients
  for (const ws of this.connectedClients.values()) {
    ws.send(JSON.stringify(payload));
  }
}
```

### Key Insights

| Insight | Detail |
|---------|--------|
| RPC is async | `await stub.method()` waits for response |
| Wakes hibernated DO | RPC call wakes sleeping DO |
| Each RPC = billable request | Factor into cost |

---

## 5. Authentication Pattern

### Challenge

WebSocket upgrade happens at HTTP layer. Once connected, no header context in DO.

### Solution

| Step | Where | What |
|------|-------|------|
| 1 | Worker | Extract & validate auth token |
| 2 | Worker | Get DO stub for photographer |
| 3 | Worker | Create WebSocketPair |
| 4 | DO | Accept connection with user context |

**Auth happens in Worker BEFORE WebSocket upgrade.** DO trusts the connection.

**Pass context via:**
- Custom headers on initial request (Worker extracts)
- RPC call to pre-register connection
- Attachment on WebSocket

---

## 6. Cost & Performance

### Pricing

| Metric | Free | Paid |
|--------|------|------|
| Requests | 100K/day | 1M + $0.15/million |
| Duration | 13K GB-s/day | 400K GB-s + $12.50/million GB-s |
| Minimum | - | $5/month |

### GB-seconds

- DO uses 128 MB for 1 second = 0.128 GB-s
- DO uses 128 MB for 60 seconds = 7.68 GB-s

### Why Hibernation Matters

| Scenario | Without Hibernation | With Hibernation |
|----------|---------------------|------------------|
| 50 photographers, mostly idle | Paying for idle GB-s | Only pay when active |
| Estimated monthly | Higher | <$10/month |

---

## 7. Architecture for Our Use Case

### Flow

```
Photographer Dashboard (Browser)
         │
         │ WebSocket connect
         ▼
Worker: WebSocket Router
         │
         │ Auth + route to DO
         ▼
Durable Object: PhotographerNotifier
         │
         │ Holds connections, broadcasts
         ▲
         │ RPC: notifyPhotoReady()
         │
Queue Consumer Worker
         │
         │ Photo processed message
         ▲
Cloudflare Queue
         │
         ▲
Photo Processing Pipeline
```

### Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| DO per | Photographer | One dashboard = one DO |
| Routing | `idFromName(photographerId)` | Deterministic |
| Hibernation | Enabled | Cost efficiency |
| Storage | SQLite | Persistence |
| External trigger | RPC | Simple, direct |

---

## 8. Gotchas

| Gotcha | Detail |
|--------|--------|
| Constructor called every wake | Don't do heavy work, restore state fast |
| In-memory state lost | Use SQLite + serializeAttachment |
| WebSocket messages have no headers | Auth at HTTP upgrade time only |
| Hibernation timing not guaranteed | Rely on cost estimate, not exact duration |
| `ctx.getWebSockets()` only in handlers | Track connections yourself |
| RPC methods must be public | Private methods not callable |
| Broadcast only reaches one DO | No cross-DO messaging built-in |

---

## 9. Limits

| Limit | Value |
|-------|-------|
| Connections per DO | ~10,000 practical |
| Attachment size | 2,048 bytes |
| CPU time per request | 5 min HTTP, 15 min alarms |
| Memory | 128 MB |

---

## 10. References

| Topic | URL |
|-------|-----|
| WebSockets Guide | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ |
| Pricing | https://developers.cloudflare.com/durable-objects/platform/pricing/ |
| Lifecycle | https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/ |
| SQLite Storage | https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ |
| State API | https://developers.cloudflare.com/durable-objects/api/state/ |
