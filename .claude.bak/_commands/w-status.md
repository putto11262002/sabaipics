---
description: Workflows status (set W-* status: stub/active/shipped/deprecated)
argument-hint: "[workflowId|W-key] [status] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-workflows/SKILL.md

Task: $ARGUMENTS

Use the `product-workflows` skill. Run Playbook: **Status**.

## Workflow (high-level)
- Parse args: resolve workflow by id or W-key (requires initiative context); detect `apply`.
- Read state: resolve `workflowId` via `product workflow list` (initiative) if only key is provided; confirm via `product workflow show`.
- Propose `product workflow status --id <workflowId> --status <stub|active|shipped|deprecated>` (dry-run).
- If `apply`: run it and verify with `product workflow show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Prefer `deprecated` over deletion.
