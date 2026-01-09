---
description: Start executing an approved execution plan (create run, plan commits, implement + log)
argument-hint: "<sliceId> <executionPlanId> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

@.claude/tech-image/README.md
@.claude/tech-image/index.md
@.claude/rules/README.md

!echo "cwd: $(pwd)"
!git rev-parse --show-toplevel 2>/dev/null || true
!git status --porcelain=v1 2>/dev/null | sed -n '1,40p' || true
!git branch --show-current 2>/dev/null || true

!echo "--- Tech Image index.md ---"
!sed -n '1,200p' .claude/tech-image/index.md

!echo "--- Slice ---"
!product slice show --id "$1"

!echo "--- Build Sheet ---"
!product build-sheet show --slice-id "$1"

!echo "--- Execution Plan ---"
!product execution-plan show --id "$2"

## Mission

Turn an **approved** execution plan into a clean execution loop:

1) Load all context
2) Understand codebase + conventions
3) Break work into commit-sized units
4) Execute (one unit per commit)
5) Append run logs (DB) as you go
6) Create PR + iterate on review

## Constraints

- Default to dry-run; only write DB / git / files when the user included `apply`.
- If the plan is not `approved`, stop and ask the human to approve it first.
- Use Tech Image for “where does this live”; use `.claude/rules/**` for low-level conventions.
- If you discover a new primitive/vendor/security boundary: stop and open an execution ADR.

## Workflow

### 1) Confirm readiness

- Verify `product execution-plan show --id "$2"` shows `status=approved`.
- Verify there is no unresolved execution ADR blocking this plan.

### 2) Start the execution run (DB)

Dry-run: print the exact command.

Apply:
- `product execution-run start --execution-plan-id "$2" --repo-ref "<repo>" --base-branch "<base>" --branch-name "<branch>" --worktree-path "<path>" --pr-url "<url>"`

Capture the returned `executionRunId` from CLI output; you will use it for all subsequent logs.

### 3) Codebase discovery (time-boxed)

- Identify change surfaces from Tech Image + `.claude/rules/**`.
- Confirm migration patterns, validation, error handling, telemetry, and rollout expectations.
- Produce a minimal checklist of repo-local conventions discovered.

### 4) Commit plan

Produce an ordered list of commit-sized units. Each unit includes:
- intent (1 line)
- files/surfaces likely touched
- tests/commands to run
- what run log to append after commit

### 5) Execute loop

For each unit:

- Implement
- Run narrow tests
- Commit
- Append a run log entry:
  - `product execution-run event --execution-run-id "<executionRunId>" --type "progress" --body-file "<path/to/progress.md>"`

### 6) PR loop (human-in-loop)

- Create PR (human may handle push/PR if network restricted).
- Record PR URL:
  - Append a run event (link):
    - `product execution-run event --execution-run-id "<executionRunId>" --type "link" --body "PR: <url>"`
- On review feedback: append notes and continue with new commits.
