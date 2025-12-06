# Tech Documentation Migration

**Status:** Pending
**Created:** 2025-12-04

---

## Purpose

This file describes the gap between current documentation state and desired organization. Migration will be done later.

---

## Current State

All tech docs live flat in `dev/tech/`:

```
dev/tech/
├── 00_use_cases.md
├── 00_flows.md
├── 00_business_rules.md
├── 01_data_schema.md
├── 02_auth.md
├── 03_api_design.md
├── 05_image_pipeline.md
├── 07_observability.md
├── 08_security.md
└── 11_project_structure.md
```

**Issues:**
1. No clear distinction between Primary (WHAT) and Supporting (HOW) docs
2. Some docs mix requirements with integration patterns
3. Missing supporting docs for WebSocket, LINE messaging
4. No RULES folder for meta-documentation

---

## Desired State

```
dev/tech/
├── RULES/
│   ├── ORGANIZATION.md      ✅ Created
│   └── WRITING_GUIDE.md     ✅ Created
│
├── # Primary Docs (WHAT)
├── 00_use_cases.md          ✅ Exists (needs review)
├── 00_flows.md              ✅ Exists (needs review)
├── 00_business_rules.md     ✅ Exists (needs review)
├── 01_data_schema.md        ✅ Exists (needs review)
├── 03_api_design.md         ✅ Exists (needs review)
│
├── # Supporting Docs (HOW)
├── 02_auth.md               ✅ Exists (needs review)
├── 05_image_pipeline.md     ✅ Exists (needs review)
├── 06_websocket.md          ❌ To create
├── 06_line_messaging.md     ❌ To create
├── 07_observability.md      ✅ Exists (OK)
├── 08_security.md           ✅ Exists (OK)
├── 09_testing.md            ❌ To create
└── 10_deployment.md         ❌ To create
```

---

## Migration Tasks

### Phase 1: New Docs (Do Now)

| Task | Status |
|------|--------|
| Create `RULES/ORGANIZATION.md` | ✅ Done |
| Create `RULES/WRITING_GUIDE.md` | ✅ Done |
| Create `06_websocket.md` | ✅ Done |
| Create `06_line_messaging.md` | ✅ Done |

### Phase 2: Review Existing Docs (Defer)

| Doc | Review Needed |
|-----|---------------|
| `00_use_cases.md` | Ensure it stays WHAT, not HOW |
| `00_flows.md` | Add references to supporting docs where needed |
| `00_business_rules.md` | Verify no implementation details leaked in |
| `01_data_schema.md` | OK - data model is requirements |
| `02_auth.md` | Verify it's pattern-focused, not code-focused |
| `03_api_design.md` | OK - API contract is requirements |
| `05_image_pipeline.md` | Verify it's pattern-focused, add references |

### Phase 3: Cross-References (Defer)

| Primary Doc | Should Reference |
|-------------|------------------|
| `00_flows.md` Flow 4 (Upload) | `05_image_pipeline.md` |
| `00_flows.md` Flow 8 (LINE) | `06_line_messaging.md` |
| `00_flows.md` Auth steps | `02_auth.md` |
| `03_api_design.md` Auth section | `02_auth.md` |

---

## What's Blocking

Nothing. New docs can follow the new mental model. Existing docs work fine, just not perfectly organized.

---

## Decision

**Continue creating new docs following new mental model.**

Defer migration/review of existing docs until:
- All supporting docs created
- Ready for implementation phase
- Natural cleanup point

---

## Notes

- `07_observability.md` and `08_security.md` already follow the new pattern (created after mental model clarified)
- Older docs (`00_flows.md`, `02_auth.md`) have some mixing but are functional
- Not worth refactoring now - would delay progress
