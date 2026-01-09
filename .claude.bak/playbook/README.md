# Playbooks (Project-Independent)

Playbooks are **project-independent** patterns and rules for a specific technology or component surface.

They are written from **official documentation** and must include source links.

## Folder structure

- Detailed patterns: `playbook/<topic>/<aspect>.md`
  - Example: `playbook/hono/server-side-rpc-definition.md`
- Simple topic overview: `playbook/<topic>.md`

## How to model a topic

- A **topic** (e.g. `next-cache`, `hono`, `react-query`) typically contains **multiple patterns**.
- Put **one pattern per file** under `playbook/<topic>/<aspect>.md`.
- Use `playbook/<topic>.md` as the **topic index/TOC**:
  - list every pattern file
  - include a 1-line **trigger summary** per pattern so agents can choose quickly

## File requirements

Every playbook file must have YAML frontmatter:

```yaml
---
title: "<pattern name>"
topic: "<topic>"           # e.g. hono, react-query, forms
tech: "<tech>"             # e.g. hono, tanstack-query, react-hook-form
techVersion: "<version>"   # e.g. "4.x", "5.x", or "unknown"
status: draft|stable
sources:
  - "<official doc link>"
---
```

## Content structure (recommended)

- **Trigger conditions** (explicit; “when this applies”)
- **Goal**
- **When not to use**
- **Minimal snippet** (only the essential lines; no repo-specific glue)
- **Workflow**
- **Checklist**
- **Notes**

## Management rules

- Prefer **small, focused** patterns; split a file when it starts covering multiple trigger conditions.
- Don’t invent patterns: every rule should have at least one **official source link** in `sources`.
- Keep snippets **portable** (no repo paths, no internal helpers).
- Deprecate by changing `status` and adding a short “Deprecated” note pointing to the replacement.

## Relationship to other tiers

- Tech Image (`.claude/tech-image/**`) = high-level system model + governance.
- Playbooks (this folder) = project-independent “how” by topic/tech.
- Project Bindings (`.claude/rules/**`) = repo-specific wiring (paths, libraries chosen, exact contracts).
