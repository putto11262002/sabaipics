# Client Error Spike Runbook

## Scope
Use this runbook when client-side error ingestion spikes.

## 1. Confirm source
- Dashboard: API metrics panel `Client Errors by Source + Type (5m)`
- Determine dominant `source_service` (`framefast-dashboard`, `framefast-event`, `framefast-ios`)

## 2. Confirm impact
- Cross-check API request success/latency to determine if issue is UX-only or API-coupled.

## 3. Deep dive
- Loki query: `event=client_error_captured`
- Group by `error_type`, inspect top stack traces and release tags.

## 4. Mitigation
- Rollback latest frontend/iOS release if critical flow regression is confirmed.
- Add temporary feature-flag disablement for unstable feature path.
