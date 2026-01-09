---
description: Set slice inclusions (requirement keys + workflow step ids) atomically
argument-hint: "[sliceId|S-key] [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-slices/SKILL.md

Task: $ARGUMENTS

Use the `product-slices` skill. Run Playbook: **Include**.

## Workflow (high-level)
- Parse args: resolve slice by id or S-key (requires initiative context); detect `apply`.
- Read state: `product slice show` and discover valid workflow step ids via `product workflow show`.
- Propose a full replacement inclusion set (`requirementKeys`, `workflowStepIds`).
- Output Markdown + proposed `product slice inclusions --id <sliceId> ...` command (dry-run).
- If `apply`: run replace-set and verify with `product slice show`.

## Gates
- Default to dry-run; only write if the user included `apply`.
- Workflow step ids must exist and belong to the slice initiative.
