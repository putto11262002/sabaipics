---
description: Publish workflow card (W*) for an existing W-* workflow
argument-hint: "[initiativeId|initiativeKey] [W-keys...] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-workflows/SKILL.md

Task: $ARGUMENTS

Use the `product-workflows` skill. Run Playbook: **Publish**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` and target W-* keys; detect `apply`.
- Read state: `product initiative show`, `product workflow list`, then `product workflow show` per selected workflow (to confirm there’s no active card yet, or to switch to Revise).
- Draft the W* card: steps + failures + requirement links (keys must exist in product registry).
- Output Markdown + proposed `product workflow publish ...` command (dry-run) (and optional status change only if requested).
- If `apply`: publish and verify with `product workflow show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Only publish for workflows that exist; only link requirement keys that exist.
