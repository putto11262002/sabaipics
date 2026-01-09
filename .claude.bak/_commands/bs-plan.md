---
description: Build sheet plan (Layer 3: generate/replace stories + tasks from a slice)
argument-hint: "<sliceId|S-key> [apply]"
allowed-tools: Bash, Read, Grep, Glob, Edit
---

@.claude/skills/product-buildsheet/SKILL.md

Task: $ARGUMENTS

Use the `product-buildsheet` skill. Run Playbook: **Plan**.

## Workflow (high-level)

- Resolve `sliceId` from `$ARGUMENTS` (uuid or S-key; ask if ambiguous).
- Read: `product slice show` (contract) and optionally workflows for step context.
- Draft 2–6 stories:
  - each has checkable AC
  - links to slice `requirementKeys` and `workflowStepIds`
  - tasks are categorized and use tech placeholders
- Output Markdown + proposed `stories.json` + `product build-sheet stories --file stories.json` (dry-run).
- If `apply`: ensure build sheet exists (`product build-sheet init`), optionally set meta, then replace stories; verify with `product build-sheet show`.

## Gates

- Default to dry-run; only write if the user included `apply`.
- Don’t invent FR/NFR keys or workflow step ids; use only what exists in slice/workflows.
- Keep tech as placeholders; flag “needs ADR” when execution implies new infra/library/system capability.
