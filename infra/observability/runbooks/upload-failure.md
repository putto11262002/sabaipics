# Upload Failure Drilldown

## Scope
Use this runbook when upload-to-index reliability or latency alerts fire.

## 1. Confirm blast radius
- Dashboard: `FrameFast Alerting + SLO` and `FrameFast Pipeline + Recognition Metrics`
- Check:
  - `Upload E2E Success Rate (15m)`
  - `Upload E2E p95 (ms)`
  - `Queue Jobs by Queue + Status (5m)` for `upload-processing` and `photo-processing`

## 2. Identify stage of failure
- If queue errors spike first: inspect `framefast_queue_jobs_total{status="error"}` split by queue.
- If upload latency spikes but queue errors are low: inspect `framefast_upload_stage_duration_ms` by stage.
- If face extraction stage spikes: inspect recognition service health panels.

## 3. Trace-level verification
- Dashboard: `FrameFast Tracing Overview`
- Query spans:
  - `{ span.name = "upload.queue.process" }`
  - `{ span.name = "photo.queue.process" }`
  - `{ span.name = "modal.process" }`

## 4. Log deep dive
- API logs: filter `event=upload_process_error` or `event=photo_process_error`
- FTP logs (if source is ftp): `service=framefast-ftp` and `event=upload_completed|upload_r2_ok|upload_started`

## 5. Immediate mitigation
- If recognition backend unavailable, route traffic to healthy recognition endpoint.
- If queue retries exploding, reduce ingest temporarily and drain DLQ safely.
- If modal processing is degraded, keep fallback path active and monitor success ratio.
