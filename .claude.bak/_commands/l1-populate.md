---
description: Layer 1 populate (0 → Layer 1: brief + outcomes + FR/NFR + targeting)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-layer1/SKILL.md

Task: $ARGUMENTS

Use the `product-layer1` skill. Run Playbook: **Populate**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show`, `product requirement list` (avoid inventing duplicates).
- Convert input into: brief deltas + outcomes (`O-*`) + stable requirements (`FR-*`/`NFR-*`) + targeting set.
- Output Markdown + proposed commands (dry-run): `product requirement upsert`, `product requirement target`, `product outcome set` (and `product initiative init` if needed).
- If `apply`: run writes and verify with `product initiative show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Preserve stable keys; don’t renumber (deprecate instead).
