---
description: Slice status (set S-* status: planned/active/shipped/deprecated)
argument-hint: "[sliceId|S-key] [status] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-slices/SKILL.md

Task: $ARGUMENTS

Use the `product-slices` skill. Run Playbook: **Status**.

## Workflow (high-level)
- Parse args: resolve slice by id or S-key (requires initiative context); detect `apply`.
- Read state: resolve `sliceId` via `product slice list` (initiative) if only key is provided; confirm via `product slice show`.
- Propose `product slice status --id <sliceId> --status <planned|active|shipped|deprecated>` (dry-run).
- If `apply`: run it and verify with `product slice show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Prefer `deprecated` over deletion.
