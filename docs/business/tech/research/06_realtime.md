# Research: Real-time Notification Mechanism

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform with two subsystems:
1. **Application subsystem:** API, business logic, user-facing
2. **Image subsystem:** Photo processing, AI, storage

When image processing completes (face detected, photo ready), we need to notify the application so participants see photos in real-time.

**Business context:**
- Event-driven traffic (spiky, not constant)
- Scale-to-zero preferred
- Small team

**Core metric:** Time-to-distribution (fast notification = participants see photos faster)

**Design drivers:**
1. Low latency (<1 second)
2. Minimize cost
3. Scale-to-zero

---

## Requirements

- **Direction:** Image subsystem → Application subsystem → Frontend
- **Latency:** <1 second from processing complete to UI update
- **Serverless compatible:** Both subsystems are serverless-friendly
- **Scale-to-zero:** No cost when no events running

---

## Scale Parameters

| Tier | Photos/month | Notifications/month |
|------|--------------|---------------------|
| Tier 1 | 5,000 | ~5,000 |
| Tier 2 | 50,000 | ~50,000 |
| Tier 3 | 400,000 | ~400,000 |

**Peak during event:** 20 photos/minute × 3 faces = ~60 notifications/minute

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Message queues / Pub-sub | |
| Managed realtime services | |
| Database-driven (triggers, polling) | |
| Direct (webhooks, callbacks) | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Technical
- Latency (publish → receive)
- Message ordering guarantees
- Delivery guarantees (at-least-once, exactly-once)
- Fan-out support (one photo → multiple listeners)

### Cost
- Pricing model
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Operational
- Scale-to-zero possible?
- Connection limits
- Complexity to implement

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Image Pipeline** | Publisher - how to send notification after processing |
| **API Backend** | Subscriber - how to receive and route to correct user |
| **Frontend** | Final delivery - websocket to browser? |
| **Serverless** | Connection management in stateless environment |

---

## Flow to Enable

```
Image Pipeline completes
        ↓
   [NOTIFICATION MECHANISM]
        ↓
   API Backend receives
        ↓
   Routes to correct event/user
        ↓
   Websocket to participant's browser
        ↓
   UI updates with new photo
```

---

## Open Questions

*Capture questions that arise during research*

