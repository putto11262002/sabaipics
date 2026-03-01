Create or capture a task in the Notion Tasks database.

## What is a Project

A Project groups multiple related tasks toward a shared, named outcome with a natural end (e.g. "Launch face recognition beta", "Migrate auth to Clerk"). If a task stands alone with no related work — no project needed.

## Task Title

Format: `[Outcome] so that [who benefits]` or `[Verb] [Object] [Qualifier]`

- **Outcome-driven**: title describes the end state or user value, not just the activity
- Specific enough to act on without opening the task
- No filler: no "we should", "look into", "it would be nice to"

Good: `Rate-limit photo uploads to prevent R2 quota abuse`
Good: `Face reco results load under 2s on event gallery`
Bad: `Fix the upload thing` / `Look into face reco performance`

## Label Taxonomy

Every task takes **one type** + **one area** (if applicable).

**Type**

| Label | Use |
|---|---|
| `feat` | New user-facing feature or capability |
| `bug` | Broken behavior |
| `chore` | Maintenance, cleanup, no user impact |
| `dx` | Developer experience, tooling |
| `infra` | Infrastructure, deploy, config, CI |

**Area**

`area:auth` · `area:events` · `area:photos` · `area:face-reco` · `area:billing` · `area:dashboard` · `area:api` · `area:mobile`

## Task Schema

| Field | Required | Notes |
|---|---|---|
| Name | **Required** | See title rules below |
| Status | **Required** | Default: `Backlog` |
| Priority | **Required** | Be honest — most things are `Medium` |
| Tags | **Required** | At least one type label; add area label if applicable |
| Assignee | Optional | Only set if clear ownership exists now |
| Project | Optional | Set if this belongs to a group of related work |
| Parent Task | Optional | Only for sub-tasks |
| Due Date | Optional | Only set if there is a real deadline |

## Writing Style

High signal, low noise. Every sentence earns its place.

- **Purpose first** — one sentence: what problem this solves or outcome it drives. Not what you're building — why.
- **Context: concise** — 1–3 sentences. Current state + what triggered this. No backstory padding.
- **Done looks like** — 2–3 bullets. Observable, testable. Write what is true when complete, not "should be".
- **References** — `@mention` relevant Notion pages inline where natural. No separate section needed.

Bad: `"We've been thinking about this for a while and there have been issues with how the system handles..."`
Good: `"Upload has no rate limiting. A single user can exhaust R2 write quota in minutes."`

## Steps

1. If not enough info to write a clear title + purpose — ask, don't guess.
2. Confirm title, priority, tags, and project (if any) before creating.
3. Create in the Notion Tasks database (data source: `fa84c98a-57e8-4a7c-ad65-ed9590892b6e`).
4. Return the task URL.
