---
title: "Testing Playbook"
topic: "testing"
tech: "testing"
techVersion: "unknown"
status: draft
sources:
  - "https://vitest.dev/"
  - "https://playwright.dev/"
---
## Goal

Define portable testing strategy and expectations.

## Trigger conditions

- You are adding new behavior or fixing bugs and need regression confidence.

## When not to use

- One-off experiments not intended to ship.

## Invariants (must always be true)

- Critical behavior has automated coverage at the right layer (unit/integration/e2e).
- Tests are deterministic and fast enough to run routinely.

## Minimal snippet

```ts
import { expect, test } from 'vitest'

test('adds', () => expect(1 + 1).toBe(2))
```

## Workflow

1) Put unit tests on pure logic.
2) Put integration tests on DB/IO boundaries.
3) Add E2E tests for key user journeys when UI/API coupling matters.

## Checklist

- [ ] New behavior has coverage
- [ ] Regression case exists for fixed bugs
- [ ] Tests run in CI (or local equivalent)

## Notes

- Repo wiring lives in `.claude/rules/testing.md`.
