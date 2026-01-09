---
title: "Observability Playbook"
topic: "observability"
tech: "otel"
techVersion: "unknown"
status: draft
sources:
  - "https://opentelemetry.io/docs/"
---
## Goal

Define portable observability expectations: logs, metrics, tracing, and alerting.

## Trigger conditions

- You are adding/changing a flow where failures must be diagnosable in production.

## When not to use

- Local-only dev tooling with no production footprint.

## Invariants (must always be true)

- Key actions emit enough signals to debug failures.
- Alerts are tied to user-impacting symptoms and have owners.

## Minimal snippet

```json
{ "level": "info", "msg": "request.completed", "traceId": "...", "latencyMs": 123 }
```

## Workflow

1) Emit structured logs and correlate them (request id / trace id).
2) Define metrics for success/error rates and latency distributions.
3) Add tracing for multi-hop flows where root cause is otherwise hard.
4) Update dashboards/alerts and add a short runbook note for new failure modes.

## Checklist

- [ ] New flow emits logs/metrics
- [ ] Dashboards/alerts updated for risky changes
- [ ] Runbook note exists for new failure modes

## Notes

- Repo wiring lives in `.claude/rules/observability.md`.
