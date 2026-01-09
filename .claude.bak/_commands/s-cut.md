---
description: Cut slice cards (S-*) as vertical shipping contracts
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-slices/SKILL.md

Task: $ARGUMENTS

Use the `product-slices` skill. Run Playbook: **Cut**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show` (targeting), `product slice list` (avoid key collisions), and optionally workflows to understand step availability.
- Propose 1–3 S-* slice cards as vertical shipping contracts (no Layer 3 expansion).
- Output Markdown + proposed `product slice upsert ...` commands (dry-run).
- If `apply`: upsert and verify with `product slice list` + `product slice show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t create Layer 3 build sheets here.
