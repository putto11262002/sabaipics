# Tech Documentation Writing Guide

## Overview

This guide covers how to write tech planning documents. For the mental model of how docs relate, see `ORGANIZATION.md`.

---

## The Documentation Flow

**Everything flows through Primary docs first.**

```
1. Define feature in Primary doc
   (00_flows.md, 00_use_cases.md)
        │
        │  "Step 15: Notify via WebSocket"
        │
        ▼
2. Hit complexity → Trigger condition?
        │
        │  Is this:
        │  - Critical unexplored area?
        │  - Important integration point?
        │
        ▼
3. STOP → Raise to human
        │
        │  "WebSocket notification needs depth.
        │   Durable Objects integration is unexplored.
        │   Should I create supporting doc?"
        │
        ▼
4. Human decides → Create Supporting doc
   (06_websocket.md)
        │
        │  Research, patterns, decisions
        │
        ▼
5. Propagate back via reference
        │
        │  Primary doc now says:
        │  "Step 15: Notify via WebSocket
        │   → See 06_websocket.md for pattern"
        │
        ▼
6. Supporting doc may enrich Primary
        │
        │  Discovery: "Need to track connection state"
        │  → Update 01_data_schema.md with new table
```

### Key Principles

1. **Primary docs are source of truth for WHAT exists**
   - Every feature must appear in a primary doc first
   - Supporting docs don't define new features

2. **Trigger conditions for Supporting docs**
   - Critical unexplored area (technology we haven't figured out)
   - Important integration point (where systems connect)
   - **Always raise to human first** - human decides whether to create

3. **Supporting docs answer HOW**
   - Created when primary doc needs technical depth
   - Research-backed, pattern-focused

4. **References connect them**
   - Primary doc references supporting doc
   - Supporting doc may trigger updates to primary docs (discoveries)

---

## Writing Primary Docs (WHAT)

Primary docs define requirements and contracts.

### Principles

1. **Focus on WHAT, not HOW**
   - Describe behavior, not implementation
   - Define contracts, not code

2. **Stay technology-agnostic where possible**
   - "Store user credentials" not "Insert into Postgres"
   - Exception: When technology IS the decision (e.g., data schema)

3. **Reference, don't duplicate**
   - Point to supporting docs for depth
   - Don't repeat integration patterns

### Structure

```markdown
# Document Title

**Status:** Draft | Complete
**Last Updated:** YYYY-MM-DD

---

## Overview

Brief context (2-3 sentences)

---

## Section 1: [Topic]

Content...

---

## Section 2: [Topic]

Content...

---

## References

- `related_doc.md` - Why it's related
```

### Tables Over Prose

Prefer tables for structured information:

```markdown
| Rule            | Constraint                     |
| --------------- | ------------------------------ |
| Upload window   | Between start and end datetime |
| Credit required | At least 1 credit              |
```

### Referencing Supporting Docs

When you hit "how does this actually work?":

```markdown
5. Authenticate request
   - Verify JWT token
   - Extract user context
   - See `02_auth.md` for pattern
```

---

## Writing Supporting Docs (HOW)

Supporting docs provide research-backed integration patterns.

### Principles

1. **Research first**
   - Read official documentation
   - Understand the technology
   - Then write the doc

2. **Establish patterns, not implementations**
   - Show the integration approach
   - Don't write full code
   - Coding agents will flesh out details

3. **Provide references**
   - Link to official docs
   - Give agents a starting point

### Structure

```markdown
# [Topic] Design

**Status:** Draft | Complete
**Last Updated:** YYYY-MM-DD

---

## Overview

What this doc covers and why it matters.

---

## Critical Decision 1: [Decision Name]

### Context

Why this decision matters.

### Decision

What we decided.

### Pattern

How it works (tables, diagrams, NOT code).

---

## Critical Decision 2: [Decision Name]

...

---

## References

| Topic         | URL         |
| ------------- | ----------- |
| Official docs | https://... |
| SDK reference | https://... |
```

### What to Include

| Include              | Example                                                   |
| -------------------- | --------------------------------------------------------- |
| Integration patterns | "Worker validates token, passes user_id to DO via header" |
| Critical decisions   | "Use Hibernation API for cost efficiency"                 |
| Connection flows     | "Queue consumer → DO stub → RPC call → broadcast"         |
| Technology choices   | "Sentry for frontend, Grafana for backend"                |
| Configuration values | "1 hour signed URL expiry"                                |
| References           | Links to official docs                                    |

### What NOT to Include

| Exclude                                         | Why                           | Where It Goes          |
| ----------------------------------------------- | ----------------------------- | ---------------------- |
| Full code implementations                       | Too detailed                  | CONTEXT files          |
| API route definitions                           | Requirements doc              | `03_api_design.md`     |
| Specific values/limits per endpoint or resource | Requirements doc (WHAT/WHERE) | Primary docs           |
| Database schemas                                | Requirements doc              | `01_data_schema.md`    |
| Business rules                                  | Requirements doc              | `00_business_rules.md` |

**Key principle:** Supporting docs explain HOW to implement patterns. They don't duplicate WHAT/WHERE information from primary docs. Instead, reference the primary doc and focus on enforcement mechanisms.

### Diagrams

Use ASCII diagrams for flows:

```markdown

```

Client → Worker → Durable Object → WebSocket
│
└── Validate auth first

```

```

Keep diagrams simple. Complex flows belong in `00_flows.md`.

---

## Research Process

Before writing a supporting doc:

### 1. Identify the Integration

What technology/service are we integrating?

### 2. Read Official Docs

- Find the official documentation
- Understand core concepts
- Note relevant sections for reference

### 3. Identify Critical Decisions

What patterns must we establish?

- Connection patterns
- Authentication flows
- Error handling approaches
- Cost considerations

### 4. Write the Doc

- One section per critical decision
- Tables over prose
- Include references

### 5. Link from Primary Docs

Update relevant primary docs to reference this supporting doc.

---

## Common Patterns

### Decision Tables

```markdown
| Option   | Pros  | Cons      | Decision |
| -------- | ----- | --------- | -------- |
| Option A | Fast  | Expensive |          |
| Option B | Cheap | Slow      | ✓        |
```

### Integration Flow Tables

```markdown
| Step | Component | Action        |
| ---- | --------- | ------------- |
| 1    | Client    | Send request  |
| 2    | Worker    | Validate auth |
| 3    | DO        | Process       |
```

### Configuration Tables

```markdown
| Setting      | Value  | Why                    |
| ------------ | ------ | ---------------------- |
| Token expiry | 1 hour | Balance security/UX    |
| Retry limit  | 3      | Prevent infinite loops |
```

### Reference Tables

```markdown
| Topic    | Reference   |
| -------- | ----------- |
| SDK Docs | https://... |
| Examples | https://... |
```

---

## Quality Checklist

Before marking a doc complete:

### Primary Docs

- [ ] Defines WHAT, not HOW
- [ ] References supporting docs for depth
- [ ] Uses tables for structured data
- [ ] No code snippets
- [ ] No technology-specific implementation details

### Supporting Docs

- [ ] Research-backed (read official docs)
- [ ] Critical decisions identified
- [ ] Patterns established (not full code)
- [ ] References included
- [ ] Linked from relevant primary docs
