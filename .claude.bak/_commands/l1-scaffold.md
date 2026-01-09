---
description: Layer 1 scaffold (create product + initiative + brief shell)
argument-hint: "[task] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-layer1/SKILL.md

Task: $ARGUMENTS

Use the `product-layer1` skill. Run Playbook: **Scaffold**.

## Workflow (high-level)
- Parse args: determine desired product + initiative; detect `apply`.
- Read state: `product product list`, `product initiative list` to avoid duplicates.
- Draft minimal `product product create` (if needed) and `product initiative init` (initiative + brief atomically).
- Output Markdown + proposed commands (dry-run).
- If `apply`: run creates and verify with `product initiative show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Don’t invent outcomes/requirements during scaffolding unless explicitly requested.
