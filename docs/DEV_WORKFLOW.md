# Dev Workflow

## Overview

AI-driven development where agents write most code. Senior engineers (us) handle planning, patterns, and decisions. Agents need extensive context to execute correctly.

---

## Workflow Phases

### Phase 1: Technical Planning (Senior Engineers)

- Technology choices
- Key patterns & conventions
- File structure & locations
- Boilerplate/infrastructure setup

**Output:** System docs, CONTEXT files

---

### Phase 2: Task Creation

- Derived from feature set + system docs
- **Outcome-focused** (WHAT, not HOW)
- High-level, may reference docs/context files
- No detailed implementation plan

**Output:** Task (outcome-focused)

---

### Phase 3: Research Agent

**Model:** Smarter (Opus/Sonnet)

**Job:**
1. Explore codebase
2. Read CONTEXT.index.md
3. Load relevant CONTEXT files based on trigger conditions
4. Check: Does task touch areas without established patterns?
   - **YES** → STOP, ask us "what should we do here?"
   - **NO** → Continue
5. Create detailed implementation plan

**Output:** Enriched task with full implementation plan

---

### Phase 4: Coding Agent

**Model:** Cheaper/faster (Haiku/Sonnet)

**Job:**
- Takes detailed implementation plan
- Pure execution - follows the plan
- Writes code

**Output:** Code, Summary, PR

---

### Phase 5: Review & Iterate

- We review code
- Give feedback → back to coding agent
- Good → merge, move on

---

## CONTEXT System

### Purpose

Provide agents with relevant patterns and rules without polluting context with unrelated information.

### Structure

Hierarchical, not flat. Files distributed across codebase.

```
project/
├── CONTEXT.index.md          # Master index with trigger conditions
├── CONTEXT.md                # Global patterns (always loaded)
├── src/
│   ├── CONTEXT.md           # src-level patterns
│   ├── auth/
│   │   └── CONTEXT.md       # Auth-specific patterns
│   ├── components/
│   │   └── CONTEXT.md       # Component patterns
│   └── api/
│       └── CONTEXT.md       # API patterns
```

### CONTEXT.index.md

Lists all context files with trigger conditions.

```markdown
| File | Trigger Condition |
|------|-------------------|
| `/CONTEXT.md` | ALWAYS |
| `/src/CONTEXT.md` | task touches src/ |
| `/src/auth/CONTEXT.md` | task involves authentication AND frontend |
| `/src/api/auth/CONTEXT.md` | task involves authentication AND backend |
```

### Conditional Loading

Research Agent:
1. Reads CONTEXT.index.md
2. Evaluates trigger conditions against task
3. Loads only matching context files

Example: Task "Add login button to navbar"
- Loads: global, src, auth (frontend), components
- Skips: api, api/auth (not backend work)

### Enrichment Loop

When Research Agent encounters unknown territory:

```
Research Agent hits area without patterns
        ↓
STOPS → Asks: "No pattern for X, what should we do?"
        ↓
We decide
        ↓
Decision added to relevant CONTEXT.md
        ↓
Future tasks automatically get this pattern
```

---

## Agent Responsibilities

| Agent | Model | Responsibility |
|-------|-------|----------------|
| Research Agent | Smarter | Think, explore, plan, ask questions, create implementation plan |
| Coding Agent | Cheaper | Execute detailed plan, no planning/thinking |
