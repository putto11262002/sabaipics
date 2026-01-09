---
description: Layer 1 revise (tighten/split requirements, improve measurability/proof hooks)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-layer1/SKILL.md

Task: $ARGUMENTS

Use the `product-layer1` skill. Run Playbook: **Revise**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show`, `product requirement list`, and spot problematic keys via `product requirement show`.
- Draft minimal edits: split bundles, tighten measurability, add proof placeholders, correct FR vs NFR invariants.
- Output Markdown + proposed commands (dry-run), prioritizing minimal stable-key-safe changes.
- If `apply`: run writes and verify with `product initiative show` + `product requirement show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t change stable keys; deprecate instead.
