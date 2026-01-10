# PR: <short title>

## Summary (required)
- What was broken (symptom): …
- Root cause (1–2 sentences): …
- Fix (what changed): …

## Verification (required)
- Commands run:
  - `...`
- Regression coverage:
  - [ ] Added/updated tests for the bug
  - [ ] Repro steps confirmed fixed (if applicable)

## Risk / Rollout (required, allow “None”)
- Risk level: low|med|high — <1 line why>
- Rollout: none | flag `<name>` | migration `<name>` | other: …
- Rollback: <1 line, or “none needed”>

<details>
<summary>Optional: Related context</summary>

- Link(s): issue / incident / PR comment thread: …
- Screenshots/logs: …
</details>

## Audit checklist (required)
- [ ] Fix is minimal and scoped
- [ ] Regression coverage included (or justified)
- [ ] Verification evidence included
- [ ] Rollout/rollback documented (or explicitly “none”)
