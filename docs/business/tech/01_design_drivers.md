# Design Drivers

Derived from: 0_initial_concept.md, 1_competitive_landscape.md, 1b_competitor_feature_deep_dive.md, 2_feature_positioning.md

---

## Core Metric

**Time-to-Distribution**: Camera → Participant

This is the core value we deliver. Every technical decision should ask: "Does this make photos reach participants faster?"

---

## Primary Drivers (Stack Ranked)

| # | Driver | What It Means | Tech Implication |
|---|--------|---------------|------------------|
| 1 | **Minimize Cost** | Infra decisions driven by price | Cheap compute, optimize per-photo economics, avoid expensive managed services unless ROI clear |
| 2 | **Time-to-Distribution** | Photo taken → participant has it (seconds/minutes, not hours) | Fast ingest pipeline, real-time processing, minimize latency at every step |
| 3 | **High Velocity Dev** | Ship fast, iterate fast | Proven tech stack, avoid novel/experimental, maximize developer productivity |
| 4 | **Fast Experience** | Snappy UX for both photographer + participant | CDN, optimized images, responsive UI, no loading spinners |
| 5 | **Face Accuracy 98%+** | Higher bar than competitors (they claim 96-99%) | Need quality face recognition, but find cost-effective option |

---

## Secondary Drivers

| Driver | Implication |
|--------|-------------|
| **Drop-in Compatibility** | FTP, Lightroom, desktop sync must work - photographers won't change workflow |
| **LINE-native** | Thailand table stakes - LINE OA, LIFF required |
| **Self-service** | No ops team - everything automated |

---

## Traffic Pattern: Event-Driven Spikes

**Key insight:** This is NOT a constant-traffic app. Activity only happens during events.

```
Traffic
  │
  │     ┌───┐           ┌───┐
  │     │   │           │   │     ┌───┐
  │     │   │           │   │     │   │
  │─────┴───┴───────────┴───┴─────┴───┴─────► Time
       Event 1         Event 2   Event 3
       (burst)         (burst)   (burst)
```

**Implications:**

| Aspect | Bad Choice | Good Choice |
|--------|------------|-------------|
| Compute | Always-on servers (paying for idle) | Serverless / scale-to-zero |
| Database | Fixed provisioned capacity | Auto-scaling or serverless |
| Workers | Long-running processes | On-demand / queue-triggered |
| Pricing model | Monthly fixed | Pay-per-use |

**This affects:**
- Prefer serverless/pay-per-invocation over always-on
- Need fast cold-start for burst handling
- Storage is fine (pay for what you store)
- CDN is fine (pay for bandwidth)
- AI compute - batch during event, idle otherwise

---

## Constraints

| Constraint | Impact |
|------------|--------|
| Small team | Prefer managed/SaaS, can't build everything custom |
| Bootstrap budget | Every dollar matters |
| Thailand focus | LINE mandatory, Thai language |

---

## Key Technical Questions

| Question | Driver | Urgency |
|----------|--------|---------|
| Cheapest face recognition at 98%+ accuracy? | Cost + Accuracy | HIGH |
| Fastest ingest pipeline (camera → cloud → processed)? | Time-to-Distribution | HIGH |
| LINE LIFF vs Mini App vs Web? | LINE-native, Cost | HIGH (log/001) |
| Build vs buy desktop app? | High Velocity vs Cost | HIGH |
| Self-hosted vs managed storage? | Cost | MEDIUM |

---

## What We're NOT Optimizing For

| Anti-Driver | Why |
|-------------|-----|
| Feature breadth | Competitors bloated, we compete on speed + simplicity |
| Enterprise scale | Self-service only |
| Innovation | Fast follower = copy what works |

