---
description: Revise workflow card (publish a new W* version)
argument-hint: "[workflowId|W-key] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-workflows/SKILL.md

Task: $ARGUMENTS

Use the `product-workflows` skill. Run Playbook: **Revise**.

## Workflow (high-level)
- Parse args: resolve workflow by id or W-key (requires initiative context); detect `apply`.
- Read state: `product workflow show` (current active version); optionally `product initiative show` for grounding.
- Draft the new W* version: tighten steps/links/failures; keep scope aligned to initiative targeting.
- Output Markdown + proposed `product workflow publish ...` command (dry-run).
- If `apply`: publish and verify with `product workflow show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Focus on steps/links/failures; avoid broadening scope without calling it out.
