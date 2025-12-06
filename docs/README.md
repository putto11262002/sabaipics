# Dev Documentation

Technical planning docs for FaceLink - event photo distribution platform with face recognition.

---

## Quick Start

1. **Understand the system** → Read primary docs first
2. **Need depth on HOW?** → Check supporting docs
3. **Writing new docs?** → Follow `tech/RULES/`

---

## Key Files

| File | What |
|------|------|
| `TECH_PLANNING_CHECKLIST.md` | Status of all tech docs, what's done/pending |
| `DEV_WORKFLOW.md` | How AI agents work with these docs |
| `tech/RULES/ORGANIZATION.md` | Mental model: Primary vs Supporting docs |
| `tech/RULES/WRITING_GUIDE.md` | How to write tech docs |

---

## Documentation Structure

### Primary Docs (WHAT the app does)

| Doc | Content |
|-----|---------|
| `tech/00_use_cases.md` | Actor-goal pairs, what users can do |
| `tech/00_flows.md` | Sequence diagrams, step-by-step operations |
| `tech/00_business_rules.md` | Business logic, validation rules |
| `tech/01_data_schema.md` | Database tables, relationships |
| `tech/03_api_design.md` | API endpoints, request/response |

### Supporting Docs (HOW we implement)

| Doc | Content |
|-----|---------|
| `tech/02_auth.md` | Clerk integration patterns |
| `tech/05_image_pipeline.md` | Photo processing architecture |
| `tech/06_websocket.md` | Durable Objects, real-time notifications |
| `tech/07_observability.md` | Monitoring, tracing, alerting |
| `tech/08_security.md` | Security patterns, PDPA compliance |

### Research (Raw exploration)

| Folder | Content |
|--------|---------|
| `research/` | Deep dives on specific technologies |

---

## How Docs Connect

```
Primary Doc (WHAT)
     │
     │  "Step 8: Notify via WebSocket"
     │
     └──► Supporting Doc (HOW)
              │
              │  Durable Objects pattern,
              │  RPC, Hibernation API
              │
              └──► Research
                    │
                    │  Official docs,
                    │  deep technical details
```

**Primary docs reference supporting docs.** Supporting docs are research-backed.

---

## Writing New Docs

1. **Check `TECH_PLANNING_CHECKLIST.md`** - Is this doc needed?
2. **Read `tech/RULES/WRITING_GUIDE.md`** - Follow the flow
3. **Primary or Supporting?**
   - Primary = WHAT (requirements, contracts)
   - Supporting = HOW (integration patterns)
4. **Hit unexplored area?** → Raise to human before creating supporting doc

---

## North Star

All docs align with `docs/0_initial_concept.md` - the business vision.

---

## Current Status

See `TECH_PLANNING_CHECKLIST.md` for live status of all checkpoints.
