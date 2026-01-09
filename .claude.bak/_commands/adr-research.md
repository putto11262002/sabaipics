---
description: Research an execution ADR and append resolution options (agent workflow)
argument-hint: "<executionAdrId>"
allowed-tools: Bash, Read, Grep, Glob, Edit, Task, WebSearch, WebFetch
---

Task: $ARGUMENTS

@.claude/skills/execution-adr-research/SKILL.md

!echo "cwd: $(pwd)"
!test -f .product.json && echo "--- .product.json ---" && cat .product.json || echo "(no .product.json found)"
!test -f .claude/tech-image/index.md && echo "--- Tech Image (index.md) ---" && sed -n '1,200p' .claude/tech-image/index.md || echo "(no .claude/tech-image/index.md found)"
!test -f .claude/rules/README.md && echo "--- Project Bindings (rules/README.md) ---" && sed -n '1,200p' .claude/rules/README.md || echo "(no .claude/rules/README.md found)"
!echo "--- Repo status (read-only) ---"
!git status --porcelain=v1 -b 2>/dev/null || true
!echo "--- Execution ADR (product execution-adr show) ---"
!product execution-adr show --id "$1"

<context>:
- `cwd`: `$(pwd)`
- Repo defaults: `.product.json` (full file if present)
- Tech Image: `.claude/tech-image/index.md` (first 200 lines if present)
- Project bindings: `.claude/rules/README.md` (first 200 lines if present)
- Repo state: `git status --porcelain=v1 -b`
- ADR source-of-truth: `product execution-adr show --id "$1"`

## Objective

You are a tech research agent.

Given `executionAdrId = $1`, use the injected `<context>` plus codebase exploration plus web research to produce **2–4 resolution options** for the ADR, then append them to the ADR via `product execution-adr option`.

The research question you must answer is the ADR **Question** (and **Context**) printed by `product execution-adr show --id "$1"`.

## Step 0 — Understand the injected context

Before exploring the codebase or searching the web, briefly extract what matters from the injected `<context>`:

- From `.product.json`: confirm any defaults that affect product/initiative/slice resolution when running other `product ...` commands.
- From `.claude/tech-image/index.md`: list the relevant primitives/governance constraints that bound viable options.
- From `.claude/rules/README.md`: identify likely change surfaces and wiring constraints (“where this would live in this repo”).
- From `git status`: confirm you are in a read-only posture (no local uncommitted experiments influencing conclusions).
- From `product execution-adr show`: restate the ADR question and extract hard constraints/assumptions/tags.

## Step 1 — Gather codebase context (CB(R)) via subagent

Before doing internet research, spawn a subagent (Task tool) to explore the repo and return a **minimal context pack** relevant to this ADR.

Use the built-in `general-purpose` subagent (do not create new subagent files). Prompt template:

- Goal: find existing primitives/patterns and likely change surfaces related to the ADR question.
- Constraints: read-only; no edits; keep output concise; include file paths and 1-line “why it matters”.
- Output (Markdown):
  1) Summary (5–10 bullets)
  2) Relevant files (paths + why)
  3) Existing primitives/patterns (names + where)
  4) Repo-specific constraints that invalidate options
  5) Open questions (3–7) for fast follow-up reading

## Research protocol (senior engineer; systematic)

Goal: convert an ambiguous blocker into a decision a senior engineer can defend with evidence, clear tradeoffs, and explicit residual risk.

### 0) Frame the research (problem → concepts → decision questions)

1) **Restate the decision**
   - Rewrite the ADR into a single crisp question: “Given constraints C, should we do A vs B to achieve outcome O?”
   - Extract *hard constraints* (must-haves / forbidden / deadlines / environment / existing stack).
   - Define:
     - **success criteria** (what must be true if we pick an option)
     - **kill criteria** (what disqualifies an option)

2) **Identify the underlying concept(s) first (don’t start with “how do I do X”)**
   - Translate “do X” into the broader technical concept(s) it sits inside.
   - Examples:
     - “revalidate every 60s” → caching + revalidation + ISR + version-specific semantics
     - “retry API requests safely” → idempotency + retries + backoff + at-least-once delivery
     - “add background processing” → queues + job retries + DLQ + operational ownership
   - Use these concepts to drive your first search terms and source selection.

3) **Break into a small research question set (`RQSet`)**
   - Turn the ADR into 3–8 concrete questions you can answer with sources or bounded experiments.
   - Suggested buckets:
     - **Semantics/spec:** what is guaranteed? what is undefined? defaults?
     - **Compatibility:** versions, environment/runtime constraints, required configuration
     - **Security/compliance:** new boundaries, data handling, threat model changes
     - **Ops/failure modes:** how it fails, monitoring/alerts, rollback/ramp needs
     - **Performance/cost:** bottlenecks, limits, known hot paths, pricing implications
     - **Migration/exit:** lock-in, reversibility, maintenance surface area

### 1) Gather repo context (CB(R)) before internet research

Use the subagent context pack from **Step 1** as your grounding for all options and web research.

### 2) Internet research (3-pass: broad → deep → reconcile)

**Pass A — Broad scan (fast triage)**
- Start with **concept-level queries** (then narrow to “how-to”):
  - `"<tech> <version> <concept>"` (e.g. `nextjs 15 caching`, `nextjs revalidation`, `ISR nextjs`)
  - `"<tech> <version> <concept> limitations|gotchas|pitfalls"`
  - `"<tech> <version> changelog <concept>"`
  - Only after concepts: `"<tech> how to <task>"` (e.g. “how to set revalidate 60”)
- Goal: shortlist 2–4 viable approaches and the top 3 risks/unknowns.
- Pin versions early in queries; treat undated advice as suspect.

**Pass B — Deep read (primary sources first)**
- Use `WebFetch` and extract *decision-grade facts* from primary sources:
  - official docs/specs/RFCs
  - release notes/changelogs (version constraints, breaking changes)
  - maintainer/owner commentary (GitHub discussions/design notes)
- Pin the relevant version(s). Treat undated advice as suspect.
- Use secondary sources (blogs/tutorials) only as leads; confirm any material claim in primary sources.

**Pass C — Reconcile & falsify**
- Cross-check claims; call out contradictions explicitly.
- Actively search for failure modes / “sharp edges” (issues, incidents, limitations).
- If something remains uncertain, convert it into a **bounded experiment**:
  - what to test, how to measure, and what result would change the decision
  - how expensive it is (time/cost) and what the “stop” condition is

### 3) Evaluate options like an owner (not a tutorial)

For each option, cover:
- **Fit** to constraints + success criteria
- **Ops**: failure modes, observability, rollback/ramp implications
- **Security/compliance**: posture changes, new boundaries
- **Adoption + exit**: migration cost, lock-in, maintenance surface

Prefer 2–4 options:
- One “default / conservative”
- One “more capable but riskier”
- Optionally, one “defer / simplify” if constraints suggest it
- Ensure each option explicitly answers the `RQSet` (or marks unknowns + the bounded experiment to resolve them).

## Constraints

- Do not implement code changes here.
- Do not mark the ADR approved; this command only appends options.

## Output contract

1) A short research summary (what you checked, key unknowns).
2) 2–4 options in a consistent format (A/B/C...), each with:
   - title
   - proposal markdown
   - pros / cons / risks (bullets)
   - recommended? (at most one)
3) Append the options to the ADR using `product execution-adr option`.

### Sources (required, inside proposal markdown)

Each option’s `proposal_markdown` must include a `## Sources` section with **relevant links** that support key claims.

Rules:
- Include **at least 2 sources per option**, with **at least 1 primary source** (official docs/spec/changelog/maintainer statement).
- Prefer **version-pinned** sources when applicable; call out version in the note if the URL doesn’t.
- Don’t dump links: each source must include a 1-line “why it matters”.

Format:
- `- [Title](https://...) — why this source matters (version/date; claim supported)`

## How to append options

For each option, run:

`product execution-adr option --execution-adr-id "$1" --key "A" --title "<title>" --proposal-file "<path/to/proposal.md>" --source "<url1>" --source "<url2>" --pro "<p1>" --pro "<p2>" --con "<c1>" --risk "<r1>" [--recommended]`

Write the proposal markdown to a file and pass its path via `--proposal-file`.
