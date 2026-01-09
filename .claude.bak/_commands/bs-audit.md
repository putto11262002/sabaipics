---
description: Build sheet audit (Layer 3: stories/tasks coverage + traceability)
argument-hint: "<sliceId|S-key> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-buildsheet/SKILL.md

Task: $ARGUMENTS

Use the `product-buildsheet` skill. Run Playbook: **Audit**.

## Workflow (high-level)

- Resolve `sliceId` from `$ARGUMENTS` (uuid or S-key; ask if ambiguous).
- Read: `product slice show`, `product build-sheet show`.
- Audit: coverage of slice inclusions, story AC quality, task structure.
- Output Markdown + minimal proposed fixes (dry-run).

## Gates

- Default to dry-run; only write if the user included `apply`.
- Keep tech as placeholders; flag “needs ADR” when execution implies new infra/library/system capability.
