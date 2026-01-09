---
description: Revise slice scope (prose fields) and align inclusions
argument-hint: "[sliceId|S-key] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-slices/SKILL.md

Task: $ARGUMENTS

Use the `product-slices` skill. Run Playbook: **Revise**.

## Workflow (high-level)
- Parse args: resolve slice by id or S-key (requires initiative context); detect `apply`.
- Read state: `product slice show` and (if needed) `product initiative show` for grounding.
- Propose minimal edits to slice fields, then align inclusions with `product slice inclusions`.
- Output Markdown + proposed commands (dry-run).
- If `apply`: run writes and verify with `product slice show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Keep changes minimal and aligned to the slice contract.
