# PR: <T-?> <short title>

## Traceability (required)
- TaskId: T-?
- Execution root: docs/logs/<root-id>/
- StoryRefs: US-?, US-?
- Plan: docs/logs/<root-id>/plan/final.md
- ADRs (if load-bearing): docs/logs/<root-id>/adr/<topic>/index.md
- Research (if load-bearing): docs/logs/<root-id>/research/<topic>.md
- PrimarySurface: DB|API|UI|Jobs|Ops

## Summary (required)
- Goal: <1–2 sentences outcome>
- Changes:
  - …

## Verification (required)
- Commands run:
  - `...`
- Key checks:
  - [ ] …

## Risk / Rollout (required, allow “None”)
- Risk level: low|med|high — <1 line why>
- Rollout: none | flag `<name>` | migration `<name>` | other: …
- Rollback: <1 line, or “none needed”>

<details>
<summary>Optional: Compatibility / Contracts</summary>

- API: none | backward compatible | breaking (plan): …
- Data model: none | compatible | migration/backfill: …
</details>

<details>
<summary>Optional: Security / Privacy</summary>

- Impact: none | auth/authz | PII | secrets | other: …
- Notes: …
</details>

<details>
<summary>Optional: Reviewer notes</summary>

- Review order:
  - `...`
- Edge cases / tradeoffs:
  - …
</details>

## Audit checklist (required)
- [ ] PR matches TaskId + Acceptance intent
- [ ] No ADR contradictions (or ADR updated)
- [ ] Verification evidence included
- [ ] Rollout/rollback documented (or explicitly “none”)
- [ ] Follow-ups captured as new TaskIds (no “TODO later”)
