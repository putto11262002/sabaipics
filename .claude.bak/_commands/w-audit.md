---
description: Workflows audit (W-* inventory + W* cards coverage/traceability)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-workflows/SKILL.md

Task: $ARGUMENTS

Use the `product-workflows` skill. Run Playbook: **Audit**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show`, `product requirement list`, `product workflow list`, and `product workflow show` for workflows under review.
- Audit: requirement coverage, missing/incorrect links, missing active cards where needed, failure behavior gaps.
- Output Markdown: findings + minimal proposed fixes as exact `product ...` commands (dry-run).
- If `apply`: run only the minimal write commands and verify with `product workflow show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t invent new requirement keys; stop and propose Layer 1 changes if needed.
