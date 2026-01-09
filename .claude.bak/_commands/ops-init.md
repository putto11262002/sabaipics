---
description: Initialize release & ops notes for an initiative (idempotent)
argument-hint: "<initiativeId|initiativeKey> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

## Workflow (deterministic)

1) Resolve `initiativeId` from `$ARGUMENTS` (uuid or initiative key; ask if ambiguous).
2) Dry-run output: proposed `product ops-notes init --initiative-id <initiativeId>` command.
3) If `apply`: run `product ops-notes init` and confirm by listing entries (should be empty).

## Gates

- Default to dry-run; only write if the user included `apply`.
