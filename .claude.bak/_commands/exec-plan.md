---
description: Generate an execution plan from a slice build sheet (gate: GREEN/YELLOW/RED)
argument-hint: "[sliceId] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

!echo "cwd: $(pwd)"
!test -f .product.json && echo "--- .product.json ---" && cat .product.json || echo "(no .product.json found)"
!test -f .claude/tech-image/index.md && echo "--- Tech Image (index.md) ---" && sed -n '1,200p' .claude/tech-image/index.md || echo "(no .claude/tech-image/index.md found; treat as placeholder/unknown)"

!echo "--- Slice (product slice show) ---"
!if [ -n "$1" ]; then product slice show --id "$1"; else echo "(no sliceId provided)"; fi

!echo "--- Build Sheet (product build-sheet show) ---"
!if [ -n "$1" ]; then product build-sheet show --slice-id "$1"; else echo "(no sliceId provided)"; fi

## Mission

Turn a **slice build sheet (Layer 3)** into a tech-side execution plan, using a deterministic gate:

- **GREEN:** fits existing primitives/conventions → plan can proceed normally
- **YELLOW:** needs repo discovery/exploration but likely fits existing patterns → plan proceeds with discovery tasks + checkpoints
- **RED:** needs a new primitive/vendor/infra/security model → open ADR and stop planning until approved

## Constraints

- This command is **planning only**: do not implement code changes here.
- Default to dry-run; only run write operations if the user included `apply`.
- Tech Image may be missing/empty; treat unknowns explicitly (YELLOW unless obvious RED trigger).

## Output contract (deterministic)

1) **Gate result** (always, JSON)
```json
{
  "classification": "GREEN|YELLOW|RED",
  "reasons": ["..."],
  "unknowns": ["..."],
  "nextActions": ["..."]
}
```

2) If **RED**: stop after proposing an **Execution ADR request** (do not proceed to planning).

3) If **GREEN/YELLOW**: output an **Implementation Plan** scaffold mapped back to build sheet stories/tasks.

4) If **GREEN/YELLOW** and `apply` was included: persist the plan as a **draft execution plan** in the DB using `product execution-plan draft` (markdown-in), then print the resulting `executionPlanId`. Do **not** approve automatically; approval is a separate explicit action.

## Execution workflow

### Step 1 — Gate (GREEN/YELLOW/RED)

Use:
- the hydrated slice + build sheet above
- Tech Image (if present) as high-level constraints and “where to change X” pointers

Classify **RED** if any task implies a new primitive/vendor/infra/security posture change.

### Step 2 — If RED: open ADR stub (stop)

Produce:
- an `execution ADR` request (key/title/question/context) linked to the build sheet
- the exact `product execution-adr request ...` command to run (flag-based, no JSON)

Only execute these DB writes if `apply` was included.

After the ADR is created:

- Run `/adr-research <executionAdrId>` to populate options (and `apply` to append them).
- Human reviews and runs `product execution-adr approve --execution-adr-id "<executionAdrId>" --approved-option-id "<optionId>" --decision-file "<path/to/decision.md>"`.
- Update Tech Image via `/tech-image-update <executionAdrId> apply` (local branch + commit), then run `product execution-adr reconcile --execution-adr-id "<executionAdrId>" --reconciled-ref "<commit|PR|path@rev>"`.
- Re-run `/exec-plan` to draft the execution plan.

### Step 3 — If GREEN/YELLOW: produce plan (stop)

Produce a plan that is:
- ordered, checkpointed, and reviewable
- grounded in repo conventions (but keep tech details as placeholders if Tech Image is empty)
- mapped back to build sheet stories/tasks (traceability)

For **YELLOW**, start with discovery tasks and explicit checkpoints:
- “Locate change surface”
- “Confirm conventions”
- “Confirm migration pattern”
- “Confirm telemetry/rollout expectations”

### Step 4 — If GREEN/YELLOW + apply: persist draft execution plan

After you output the plan markdown, run:

- If `$1` (sliceId) is provided:
  - `product execution-plan draft --slice-id "$1" --title "<short title>" --plan-file "<path/to/plan.md>"`

Write plan markdown to a file, then propose the explicit approval command:

- `product execution-plan approve --id "<executionPlanId>"`

After the execution plan is approved, start the coding handoff:

- `product execution-run start --execution-plan-id "<executionPlanId>" --repo-ref "<repo>" --base-branch "main" --branch-name "<branch>" --worktree-path "<path>" --pr-url "<url>"`

## Notes

- For `/exec-plan`, a `sliceId` is required to hydrate the slice + build sheet.
