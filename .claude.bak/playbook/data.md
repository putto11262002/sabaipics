---
title: "Data Playbook"
topic: "data"
tech: "postgres"
techVersion: "unknown"
status: draft
sources:
  - "https://www.postgresql.org/docs/"
  - "https://orm.drizzle.team/docs/overview"
---
## Goal

Define portable patterns for schema changes, migrations/backfills, and data integrity.

## Trigger conditions

- You are adding/changing DB schema, backfilling data, or changing ownership boundaries.

## When not to use

- You are only refactoring code with no persistence/contract changes.

## Invariants (must always be true)

- Migrations are forward-compatible and safe to apply in production.
- Backfills are resumable and observable.
- Data ownership is explicit (who is allowed to write what).

## Minimal snippet

```sql
-- Additive first:
ALTER TABLE some_table ADD COLUMN new_field text;
```

## Workflow

1) Prefer an additive schema change (new tables/columns) before destructive changes.
2) If you need a backfill, design it to be resumable: batch, checkpoint, and measure.
3) Separate schema migration from data backfill when risk is high.
4) Write down the rollback story (or explicitly state it’s not possible + mitigations).

## Checklist

- [ ] Migration is additive/safe (or has a staged plan)
- [ ] Backfill plan exists (if needed) with batching + observability
- [ ] Rollback story exists (or explicitly impossible with mitigation)

## Notes

- Repo wiring lives in `.claude/rules/data.md`.
