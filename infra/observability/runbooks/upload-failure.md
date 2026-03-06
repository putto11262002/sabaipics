# Upload Failure Drilldown

## Scope
Use this runbook when upload-to-index reliability or latency alerts fire.

## 1. Confirm blast radius
- Dashboard: `FrameFast Alerting + SLO` and `FrameFast Pipeline + Recognition Metrics`
- Check:
  - `Pipeline Consumer Jobs Total` — `framefast_pipeline_consumer_jobs_total`
  - `Pipeline E2E p95` — `framefast_pipeline_callback_e2e_duration_ms`
  - `Pipeline Callback Status` — `framefast_pipeline_callback_jobs_total`

## 2. Identify stage of failure
- Check consumer step durations: `framefast_pipeline_consumer_step_duration_ms` by `step`.
- Hot steps: `modal_submit` (Modal cold start), `debit_credits` (DB transaction), `head_check` (R2).
- If callback failures: `framefast_pipeline_callback_jobs_total{status="error"}`.
- E2E latency: `framefast_pipeline_callback_e2e_duration_ms`.
- If face extraction stage spikes: inspect recognition service health panels.

## 3. Trace-level verification
- Dashboard: `FrameFast Tracing Overview`
- Pipeline spans:
  - `{ span.name = "pipeline_consumer.batch" }`
  - `{ span.name =~ "pipeline_consumer\\..*" }`
  - `{ span.name = "pipeline_callback.batch" }`
  - `{ resource.service.name = "framefast-orchestrator" }`

## 4. Log deep dive
- Pipeline logs: filter `event=~"pipeline_consumer_.*"` or `event=~"pipeline_callback_.*"`
- FTP logs (if source is ftp): `service=framefast-ftp` and `event=upload_completed|upload_r2_ok|upload_started`

## 5. Immediate mitigation
- If recognition backend unavailable, route traffic to healthy recognition endpoint.
- If queue retries exploding, reduce ingest temporarily and drain DLQ safely.
- If modal processing is degraded, keep fallback path active and monitor success ratio.
