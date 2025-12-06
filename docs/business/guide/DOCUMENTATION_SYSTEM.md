---
title: Documentation System
description: Mental model for how documents relate to each other, flow downstream, and collectively map vision to product.
---

# Documentation System

This guide governs the **entire documentation workflow** — how documents relate to each other, build on one another, and collectively transform abstract vision into concrete product.

For rules on writing **individual documents**, see [WRITING_STYLE.md].

---

## Core Mental Model

```
North Star (abstract vision)
        ↓
   Downstream docs
   (increasingly concrete)
        ↓
   Validated product
        ↑
   Feedback loop (can trigger upstream pivots)
```

---

## Principles

### 1. North Star Stays Abstract

- The top-level document is the **vision** — what we want to exist in the world
- It should be stable but not rigid
- Downstream docs make it concrete; the north star stays directional

### 2. Downstream = More Concrete

Each downstream document:
- Builds on the document(s) above it
- Adds **validation** (market data, cost analysis, customer feedback)
- Adds **specificity** (features, pricing, technical decisions)
- Gets closer to actual implementation

**Abstraction gradient:**
```
Vision → Strategy → Tactics → Execution → Product
```

### 3. Each Document is Tightly Scoped

- A document answers **one question** or addresses **one concern**
- It does not bleed into other documents' territory
- Out-of-scope items are referenced, not elaborated (see [WRITING_STYLE.md] for tagging)

**Good scope:** "What features do competitors offer?"
**Bad scope:** "What features do competitors offer and what should we build and how much will it cost?"

### 4. Downstream Validates Upstream

Downstream documents don't just elaborate — they **test assumptions**:
- Does market reality support the vision?
- Do costs allow the proposed features?
- Do customers actually want this?

If validation fails, it triggers upstream reconsideration (see Principle 6).

### 5. Gates Enforce Quality

- Each document has a **gate** — a pass/fail checkpoint
- Gates are questions that must be answerable with confidence
- Do not proceed downstream until the gate passes
- Gates prevent building on shaky foundations

**Example gates:**
- "Do we understand the market well enough to position ourselves?"
- "Do we know what it costs to deliver?"
- "Are people willing to pay?"

### 6. Feedback Flows Both Ways

```
Upstream ←── can be updated by ←── Downstream
```

- Downstream research may invalidate upstream assumptions
- Customer feedback may challenge the original vision
- **Pivots are legitimate** — update upstream docs when evidence demands it
- Mark upstream changes clearly so downstream docs can realign

### 7. Documents Collectively Map Vision to Product

The documentation system is not a filing cabinet — it's a **transformation pipeline**:

```
Abstract idea
    → Validated by market research
    → Scoped into features
    → Costed and architected
    → Positioned against competition
    → Tested with real customers
    → Built into product
    → Refined by feedback
```

Every document contributes to this transformation. If a document doesn't move the vision toward product, question whether it's needed.

---

## Document Relationships

### Upstream vs. Downstream

| Term | Meaning |
|------|---------|
| **Upstream** | Documents closer to the north star (more abstract) |
| **Downstream** | Documents closer to execution (more concrete) |

### Dependency Direction

- Downstream docs **depend on** upstream docs
- Upstream docs **inform** downstream docs
- Changes flow down automatically; changes flow up intentionally (pivots)

### Cross-References

- Reference upstream docs to show alignment with vision
- Reference downstream docs to defer decisions (e.g., "pricing TBD in positioning doc")
- Never duplicate content — reference and move on

---

## Decision Log (`docs/log/`)

For important decisions that need discussion or cannot be resolved immediately.

**Structure:**
- `docs/log/index.md` - Index of all decisions
- `docs/log/001.md`, `002.md`, etc. - Individual entries

**When to use:**
- Decision needs discussion before committing
- Decision depends on future research
- Important choice worth documenting for posterity

**Lifecycle:**
1. Create log entry when decision arises
2. Reference from main doc: `[TBD - see log/001](log/001.md)`
3. Discuss, research, decide
4. Mark status: RESOLVED
5. Update referencing docs with decision

---

## Workflow

### Moving Forward (Downstream)

1. Complete current document
2. Verify gate passes
3. Mark checklist item as complete
4. Proceed to next document

### Moving Backward (Upstream Pivot)

1. Downstream research reveals upstream assumption is wrong
2. Document the evidence in current doc
3. Update upstream doc with new information
4. Mark upstream doc with [UPDATED] tag and date
5. Reassess downstream docs that may be affected

---

## Anti-Patterns

### Scope Creep
- **Symptom:** Document tries to answer everything
- **Fix:** Split into multiple documents or defer with tags

### Premature Concreteness
- **Symptom:** Early docs contain implementation details
- **Fix:** Move details downstream; keep upstream abstract

### Orphan Documents
- **Symptom:** Document doesn't connect to upstream or downstream
- **Fix:** Either connect it to the flow or delete it

### Stale Upstream
- **Symptom:** Downstream docs have evolved but upstream still reflects old thinking
- **Fix:** Propagate learnings upstream; keep north star current

### Gate Skipping
- **Symptom:** Moving to next doc without answering the gate question
- **Fix:** Stay on current doc until gate passes; adjust scope if needed

---

## Relationship to Other Guides

| Guide | Governs |
|-------|---------|
| **This document** | How documents relate and flow (the system) |
| **WRITING_STYLE.md** | How to write individual documents (the format) |
| **CHECKLIST.md** | What documents exist and their status (the inventory) |

---

## Summary

- North star is abstract; downstream is concrete
- Each doc is scoped tightly and validates upstream
- Gates ensure quality before moving forward
- Feedback can flow upstream (pivots are okay)
- The system transforms vision into product
