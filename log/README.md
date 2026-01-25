## Logs

This folder is an append-only knowledge base for SabaiPics.

Use `log/` for investigation notes, experiments, architecture decisions (especially infra/ops), and context that is useful later but does not belong in product specs or inline code comments.

### Intent

- Preserve decisions and rationale (what we chose, why, alternatives).
- Record research/experiments/benchmarks so we don't repeat work.
- Provide lightweight handoff context for future engineers.
- Keep a time-ordered narrative inside a topic file (append new findings; avoid rewriting history).

### Structure

Logs are organized by surface/component and an optional sub-surface:

`log/<surface-or-component>/<optional-sub-surface>/NNN-topic.md`

Examples:

- `log/infra/flyio/001-flyio-machines-billing-autostop.md`
- `log/api/002-rate-limit-notes.md`
- `log/dashboard/003-upload-ui-experiments.md`

Depth is limited to 1-2 folders under `log/`.

### Numbering

`NNN` is sequential per folder (not global) and must be 3 digits (zero-padded):

- `log/infra/flyio/001-...`, `log/infra/flyio/002-...`
- A different folder can also start at `001`.

When you add a new topic in a folder, use the next available number in that folder.

### Writing guidelines

- Prefer ASCII.
- Start each file with a clear title and `Date: YYYY-MM-DD`.
- Keep files append-only: add new notes at the end with dates or section headers.
- Link to primary sources (docs, issues, PRs) when possible.
