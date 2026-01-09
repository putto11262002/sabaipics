---
description: Layer 1 audit (brief + outcomes O-* + requirements FR/NFR + targeting)
argument-hint: "[initiativeId|initiativeKey] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-layer1/SKILL.md

Task: $ARGUMENTS

Use the `product-layer1` skill. Run Playbook: **Audit**.

## Workflow (high-level)
- Parse args: resolve `initiativeId` (or look up by key); detect `apply`.
- Read state: `product initiative show`, `product requirement list`.
- Run Audit checks: brief integrity, outcomes signals, FR/NFR quality + initiative targeting completeness.
- Output Markdown: findings + minimal proposed fixes as exact `product ...` commands (dry-run).
- If `apply`: run only the minimal write commands and re-verify with `product initiative show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t invent new requirement keys; if missing, propose a Layer 1 change set (or ADR if blocked).
