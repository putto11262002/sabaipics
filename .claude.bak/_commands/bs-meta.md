---
description: Build sheet meta (Layer 3: replace decision bullets + risks)
argument-hint: "<sliceId|S-key> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-buildsheet/SKILL.md

Task: $ARGUMENTS

Use the `product-buildsheet` skill. Run Playbook: **Meta**.

## Workflow (high-level)

- Resolve `sliceId` from `$ARGUMENTS` (uuid or S-key; ask if ambiguous).
- Read: `product slice show` (and `product build-sheet show` if present).
- Draft `decisionBullets` + `risks` (short, checkable; no tech design).
- Output Markdown + proposed `product build-sheet meta ...` command (dry-run).
- If `apply`: ensure build sheet exists (`product build-sheet init`) and then set meta.

## Gates

- Default to dry-run; only write if the user included `apply`.
- Keep tech as placeholders; decisions/risks should be product/delivery oriented.
