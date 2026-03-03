# SLO Targets

## Upload-to-index SLO
- Objective window: 30 days
- Availability objective: 99.0%
- Latency objective: p95 <= 120s
- SLI success query:
  - `100 * sum(rate(framefast_upload_e2e_total{status="ok"}[15m])) / clamp_min(sum(rate(framefast_upload_e2e_total[15m])), 0.001)`
- SLI latency query:
  - `histogram_quantile(0.95, sum by (le) (rate(framefast_upload_e2e_duration_ms_milliseconds_bucket[15m])))`

## Search SLO
- Objective window: 30 days
- Availability objective: 99.0%
- Latency objective: p95 <= 5s
- SLI success query:
  - `100 * sum(rate(framefast_search_e2e_total{status="ok"}[15m])) / clamp_min(sum(rate(framefast_search_e2e_total[15m])), 0.001)`
- SLI latency query:
  - `histogram_quantile(0.95, sum by (le) (rate(framefast_search_e2e_duration_ms_milliseconds_bucket[15m])))`
