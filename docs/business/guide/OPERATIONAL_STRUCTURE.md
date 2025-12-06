---
title: Operational Structure
description: Container system for teams, playbooks, logs, context. Defines directory hierarchy, naming conventions, file formats, and scoping rules. Foundation for adaptive playbook system.
---

# Operational Structure

## Purpose

Define the **container system** that enables:
- Team autonomy (each team has isolated space)
- Signal clarity (no overlap, maximum information density)
- Consistent format (one style across all operational docs)
- Adaptive playbook evolution (patterns emerge from execution logs)

---

## Directory Hierarchy

```
/operations/
├── playbooks/
│   ├── company/
│   │   └── [company-level playbooks]
│   └── [team-name]/
│       └── [team-specific playbooks]
├── [team-name]/
│   ├── context.md          (current state, blockers, decisions pending)
│   ├── logs.md             (execution record, decisions made, learnings)
│   ├── todo.md             (active items, owner, deadline)
│   └── playbooks/
│       └── [team playbooks]
└── messages/
    └── [request/response archives by date]
```

### Separation Rule

- **Company-level playbooks** (`/operations/playbooks/company/`): Principles, gates, thresholds, decision frameworks
- **Team-level** (`/operations/[team-name]/`): Current state, execution logs, team playbooks, todos
- **Zero cross-reference rule**: Files in one scope never reference files in another scope FEEDBACK: This is wrong can reference but not cover in other files e.g. we this tream file must inc;ude copamny branding it does not encoe company branch but rather reference comapny banding file to avoid duplciation
- **Alignment happens at request time** (team references company docs in request message, not in their own files)

---

## File Format & Metadata

Every operational file starts with:

```markdown
---
scope: [company | team]
team: [team-name or N/A]
version: [YYYY-MM-DD or incremental]
owner: [agent name or "CEO"]
updated: [YYYY-MM-DD]
---
```

### Example headers:

**Company playbook:**
```markdown
---
scope: company
team: N/A
version: 2025-01-15
owner: Orchestrator
updated: 2025-01-15
---
```

**Team context:**
```markdown
---
scope: team
team: product
version: 2025-01-15
owner: Head of Product
updated: 2025-01-15
---
```

---

## Naming Conventions

### Playbooks

**Format:** `[process-name]_[version-date].md`

Examples:
- `phase_5_validation.md` (company-level)
- `interview_script.md` (marketing team)
- `sprint_planning.md` (product team)

**Rule:** Once a playbook is formalized, version it by date. If still evolving, use `_draft` suffix.

### Context Files

**Format:** `context.md` (one per team, always overwritten with current state)

### Logs

**Format:** `logs.md` (one per team, chronologically appended)

### Messages

**Format:** `[YYYY-MM-DD]_[from-team]_to_[to-agent].md`

Examples:
- `2025-01-15_product_to_orchestrator.md`
- `2025-01-15_orchestrator_to_ceo.md`

---

## Content Structure Rules

### Playbooks (Company & Team Level)

```markdown
# [Playbook Name]

## Purpose
[Why this process exists, what problem it solves]

## Scope
[What is/isn't included; team responsibility]

## Success Criteria
[How we know it worked]

## Owner
[Agent responsible for execution]

## Gates & Decisions
[Decision thresholds, approval points]

## Steps / Process
[Sequential or decision-tree format]

## Inputs Required
[What team needs before starting]

## Outputs / Deliverables
[What team produces]

## Signals to Track
[What we measure to improve playbook]

## Evolving Notes
[Learnings, updates, iterations]
```

### Context Files (Team-Level)

```markdown
# [Team Name] Context

## Current State
[What team is working on NOW]

## Blockers
[What's preventing progress]

## Decisions Pending
[What needs CEO/Orchestrator approval]

## Previous Decisions
[What was decided recently, reference to message archive]

## Dependencies
[Other teams or external factors]

## Last Updated
[Date + who]
```

### Logs (Team-Level)

```markdown
# [Team Name] Logs

## [YYYY-MM-DD] - [Brief Summary]
- Decision: [what was decided]
- Owner: [who made it]
- Evidence: [@message/archive or inline]
- Outcome: [result, if known]
- Learnings: [what we learned]

---

## [YYYY-MM-DD] - [Brief Summary]
...
```

### Messages (Request/Response)

```markdown
---
from: [team name / orchestrator / ceo]
to: [orchestrator / ceo / team name]
date: YYYY-MM-DD
type: [request | decision | escalation]
---

## Signal

[Clear statement of what's being asked/decided]

## Context References

- Team state: @operations/[team]/context.md
- Company alignment: @docs/BUSINESS_POSITION.md (or relevant doc)
- Previous decision: @operations/messages/[YYYY-MM-DD]_archive.md

## Options (if request)

**Option A:** [Path + reasoning]
**Option B:** [Path + reasoning]
**Recommendation:** [Which option + why]

## Decision (if response from CEO/Orchestrator)

**Approved:** [Option chosen]
**Reasoning:** [Why this path]
**Next step:** [What team does now]
**Signal to track:** [What we monitor to validate this decision]
```

---

## Scoping Rules (Zero Overlap)

**Company-level documents own:**
- Strategic direction (business position, north star alignment)
- Decision thresholds (what triggers action, what constitutes success)
- Principles (how we operate)

**Team-level documents own:**
- Execution state (what we're doing, blockers, pending decisions)
- Concrete steps (how we do it)
- Logs (what happened, decisions made, learnings)

**No team playbook references company docs.**
**No company playbook references team docs.**
**Alignment is explicit in request messages, not implicit in files.**

---

## Style Guide (All Operational Files)

- **Signal density:** Every sentence earns its place. Cut noise ruthlessly.
- **Active voice:** "Team decided X" not "It was decided."
- **Specificity:** Dates, owner names, decision references (not "we discussed" → "2025-01-15 CEO approved Option B").
- **Links within scope only:** Use `@operations/[team]/context.md` within team scope. Never cross-scope references.
- **Metadata always at top:** Version, owner, scope, updated date on every file.

---

## Evolution Rules (Adaptive System)

**How playbooks are born:**

1. Team executes work ad-hoc, logs decisions
2. After 2-3 cycles, pattern emerges (same process repeated, similar outcomes)
3. CEO or team proposes formalizing as playbook
4. Playbook lives in `_draft` status while tested
5. After success, versioned permanently with date
6. Updates append to `Evolving Notes` section in playbook

**When to retire a playbook:**

- Process changes fundamentally
- Team moves to different approach
- Owner decision recorded in message archive + team logs
- Archive the old playbook (don't delete)

---

## Summary: What Belongs Where

| What | Where | Owner | Format |
|------|-------|-------|--------|
| Business strategy, north star | `/docs/0_initial_concept.md` | CEO | Business docs |
| Company-level decision framework | `/operations/playbooks/company/` | CEO/Orchestrator | Playbook format |
| Team current state | `/operations/[team]/context.md` | Team head agent | Context format |
| Team execution record | `/operations/[team]/logs.md` | Team head agent | Log format |
| Team active work | `/operations/[team]/todo.md` | Team head agent | Todo format |
| Team playbooks | `/operations/[team]/playbooks/` | Team head agent | Playbook format |
| Request/decision flow | `/operations/messages/` | Sender | Message format |
| Operational standards | `/docs/guide/` | CEO | Guide format |
