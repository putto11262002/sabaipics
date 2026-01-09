---
description: Workflows inventory (create/update W-* coverage map)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-workflows/SKILL.md

Task: $ARGUMENTS

Use the `product-workflows` skill. Run Playbook: **Inventory**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show` (must have targeting), `product workflow list`, `product requirement list`.
- Cluster targeted requirement keys into W-* inventory items with `linkedFrNfr` coverage.
- Output Markdown: proposed inventory + coverage gaps + proposed `product workflow upsert ...` commands (dry-run).
- If `apply`: run `product workflow upsert` per W-* and verify with `product workflow list`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Require Layer 1 targeting first; don’t publish W* cards here.
