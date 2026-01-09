---
description: Append an ops note entry (Layer 4, append-only)
argument-hint: "<initiativeId|initiativeKey> <kind> <title...> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

## Workflow (deterministic)

1) Resolve `initiativeId` from `$ARGUMENTS` (uuid or initiative key; ask if ambiguous).
2) Parse `kind` + `title` from args. If missing, ask:
   - `kind`: one of `flag_ramp|rollback|dashboards_alerts|failure_modes|ownership_escalation|runbook|note`
   - `title`: 1-line summary
3) Draft `bodyMarkdown` (short, operationally useful).
4) Dry-run output: proposed `product ops-notes append ...` command (use `--body` or `--body-file`).
5) If `apply`: ensure container exists (`product ops-notes init`) and append, then list entries via `product ops-notes list`.

## Gates

- Default to dry-run; only write if the user included `apply`.
- Append-only: don’t “edit history”; if something changes, append a new entry.
- Don’t include secrets/credentials in `bodyMarkdown`.
