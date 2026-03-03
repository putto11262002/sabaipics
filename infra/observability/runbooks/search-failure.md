# Search Failure Drilldown

## Scope
Use this runbook when search success rate or latency alerts fire.

## 1. Confirm symptom
- Dashboard: `FrameFast Alerting + SLO`, `FrameFast Pipeline + Recognition Metrics`
- Check:
  - `Search E2E Success Rate (15m)`
  - `Search E2E p95 (ms)`
  - `Recognition Requests/Errors by source + status`

## 2. Isolate stage
- Stage metrics:
  - `framefast_search_stage_duration_ms{stage="face_extraction"}`
  - `framefast_search_stage_duration_ms{stage="vector_search"}`
- If extraction is slow/failing, investigate recognition endpoint health.
- If vector search is slow/failing, inspect database latency and query saturation.

## 3. Trace and logs
- TraceQL:
  - `{ span.name = "recognition.inference" }`
  - `{ resource.service.name = "framefast-api" && span.name = "http.request" }`
- Logs:
  - filter `event=search_failed` and `error_type`
  - correlate by `traceparent` and `request_id`

## 4. Immediate mitigation
- Fail open to lower-cost similarity threshold only if product approves.
- Rate-limit high traffic clients temporarily if backend saturation is the trigger.
