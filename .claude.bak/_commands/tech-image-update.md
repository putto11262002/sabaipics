---
description: Update Tech Image from an approved execution ADR (draft patch + local PR branch)
argument-hint: "<executionAdrId> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

@.claude/tech-image/README.md
@.claude/tech-image/index.md

!echo "cwd: $(pwd)"
!echo "--- Execution ADR ---"
!product execution-adr show --id "$1"

!echo "--- Tech Image index.md ---"
!sed -n '1,200p' .claude/tech-image/index.md

!echo "--- Tech Image README.md ---"
!sed -n '1,200p' .claude/tech-image/README.md

!echo "--- Tech Image files ---"
!ls -la .claude/tech-image

## Mission

Incorporate the approved execution ADR decision into `.claude/tech-image/**` as a minimal, reviewable patch, then prepare a PR locally (branch + commit).

## Constraints

- Do not implement product code changes.
- Default to dry-run; only edit files / create branch / commit if the user included `apply`.
- Do not mark the ADR reconciled here; reconciliation happens after merge:
  - `product execution-adr reconcile --execution-adr-id "$1" --reconciled-ref "<mergeCommit|PR URL|path@rev>"`

## Workflow

1) Confirm the ADR is approved and has an approved option.
2) Decide which Tech Image file(s) need updates by following `.claude/tech-image/index.md` + `.claude/tech-image/README.md`.
3) Draft minimal edits:
   - include ADR key + selected option
   - capture only high-level system context (primitives/boundaries/ops/security)
4) Prepare a local PR:
   - create branch: `git checkout -b tech-image/adr-$1`
   - commit: `git commit -am "tech-image: reconcile adr $1"`

## Output

- Dry-run:
  - list targeted files and a short summary of each change
  - print the proposed `git` commands (branch + commit)
- Apply:
  - make the file edits
  - create the branch + commit locally
  - print next commands the human should run to push + open a PR
