---
description: List ops notes entries for an initiative (read-only)
argument-hint: "<initiativeId|initiativeKey> [kind=note] [limit=50] [order=desc]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

Task: $ARGUMENTS

## Workflow (deterministic, read-only)

1) Resolve `initiativeId` from `$ARGUMENTS` (uuid or initiative key; ask if ambiguous).
2) Run `product ops-notes list --initiative-id <initiativeId>` and present the Markdown output.
