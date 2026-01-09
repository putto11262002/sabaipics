---
description: Layer 1 retarget (set included/deferred/out_of_scope requirement targets)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-layer1/SKILL.md

Task: $ARGUMENTS

Use the `product-layer1` skill. Run Playbook: **Retarget**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show` (current targets), `product requirement list` (valid keys).
- Propose the replacement included set (not targeted = excluded for now).
- Output Markdown + proposed `product requirement target ...` command (dry-run).
- If `apply`: run it and verify with `product initiative show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Target only requirements that exist in the product registry.
