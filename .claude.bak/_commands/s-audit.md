---
description: Slices audit (S-* correctness + inclusions + traceability)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-slices/SKILL.md

Task: $ARGUMENTS

Use the `product-slices` skill. Run Playbook: **Audit**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show`, `product workflow list` + `product workflow show` (for step ids), `product slice list` + `product slice show`.
- Audit: inclusion validity, missing traceability, slice contract coherence vs targeting.
- Output Markdown: findings + minimal proposed fixes as exact `product ...` commands (dry-run).
- If `apply`: run only minimal writes and verify with `product slice show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t invent requirement keys or workflow step ids.
