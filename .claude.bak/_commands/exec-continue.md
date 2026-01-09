---
description: Continue an existing execution run (load run log + plan + PR context, then keep executing)
argument-hint: "<executionRunId> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

@.claude/tech-image/README.md
@.claude/tech-image/index.md
@.claude/rules/README.md

!echo "cwd: $(pwd)"
!git rev-parse --show-toplevel 2>/dev/null || true
!git status --porcelain=v1 2>/dev/null | sed -n '1,60p' || true
!git branch --show-current 2>/dev/null || true
!git log -n 12 --oneline 2>/dev/null || true

!echo "--- Execution Run (includes append-only logs) ---"
!product execution-run show --id "$1"

## Mission

Resume execution with full continuity:

- use the run log to avoid rework
- incorporate PR feedback
- continue commit-sized execution and append new run notes

## Constraints

- Default to dry-run; only write DB / git / files when the user included `apply`.
- If you discover a new primitive/vendor/security boundary: stop and open an execution ADR.

## Workflow

1) Extract from run output:
   - `executionPlanId`
   - current branch + PR URL (if present)
   - last completed checkpoints/notes
2) Re-load the execution plan:
   - `product execution-plan show --id "<executionPlanId>"`
3) Identify “next unit of work”:
   - either the next planned checkpoint, or the next PR feedback item
4) Execute the next unit:
   - implement + tests + commit
   - append a run note:
     - `product execution-run event --execution-run-id "$1" --type "progress" --body-file "<path/to/progress.md>"`
5) Repeat until merged/closed, then mark status:
   - `product execution-run end --execution-run-id "$1" --status merged|closed|canceled`
