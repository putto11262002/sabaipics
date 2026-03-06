# Sampling and Budget Plan

## 1. Trace Sampling Policy

Single control variable across services:
- `OTEL_TRACE_SAMPLE_RATIO` (range `0.0` to `1.0`)

Default ratios when unset:
- `development`: `1.0`
- `staging`: `0.60`
- `production`: `0.50`

Applied in:
- API worker (`src/api/src/lib/observability/trace.ts`)
- API worker V2 pipeline (`src/api/src/lib/observability/instrument.ts`)
- FTP server (`infra/ftp-server/internal/observability/otel.go`)
- Recognition service (`infra/recognition/modal_app.py`)
- Image pipeline service (`image-pipeline/src/image_pipeline/main.py`)
- Orchestrator service (`infra/recognition/orchestrator_app.py`)

Implementation notes:
- Parent-based behavior is preserved:
  - API spans inherit incoming `traceparent` flags.
  - FTP/Python services use parent-based ratio samplers.
- Metrics and logs remain unsampled.

## 2. Ingestion Cost Estimates (Planning Baseline)

Assumptions (non-conservative, realistic growth baseline):
- Uploads/day: `120k`
- Searches/day: `80k`
- API req/day (all routes): `2.0M`
- Avg trace spans/requested flow: `6`
- Avg log size/event: `700 bytes`

Estimated daily volume:
- Traces:
  - raw: `~2.0M spans/day`
  - sampled at 10%: `~200k spans/day`
- Logs:
  - core API/worker + FTP structured logs: `~1.5M events/day`
  - size: `~1.0-1.5 GB/day`
- Metrics:
  - primarily low-cardinality counters/histograms; cost dominated by active series count.

Monthly budget planning envelope:
- Logs: `30-45 GB/month` baseline; alert at `>40 GB/month` trend.
- Traces: `6M sampled spans/month` baseline; alert at `>10M/month` trend.
- Metrics series: target `<3k` active series steady-state, hard budget `<7k`, free-tier cap caution around `10k`.

## 3. Cardinality Guardrails

Rules:
- Allowed in metric labels:
  - `status`, `status_class`, `queue`, `operation`, `source`, `severity`, `error_class`
- Allowed only with bounded enum control:
  - `stage` (must be fixed finite set)
  - `source_service` (known apps only)
  - `error_type` (normalized, top-level categories only)
- Never allow in metric labels:
  - IDs (`event_id`, `photo_id`, `user_id`, UUIDs)
  - Paths/URLs/query strings
  - Free text (`message`, `stack`, dynamic exception strings)

Current high-risk areas and action:
- `route_group` removed from API request/error metrics to reduce series growth.
- Route-level diagnosis should use logs/traces, not metric label dimensions.

## 4. Series Budget by Metric Family

Target max active series per family (production):
- API core (`framefast_api_*`): `<= 300`
- Pipeline consumer + callback (`framefast_pipeline_consumer_*`, `framefast_pipeline_callback_*`): `<= 400`
- Orchestrator (`framefast_orchestrator_*`): `<= 200`
- Recognition + image pipeline: `<= 900`
- FTP: `<= 200`
- Client errors (`framefast_client_errors_total`): `<= 300`
- Headroom/reserved: `<= 2000`

Total target steady-state: `<= 4900` active series.

## 5. Operational Controls

- Monthly review:
  - active series trend
  - top label cardinality contributors
  - logs/traces ingest trend vs baseline envelope
- Release gate for observability changes:
  - new metric labels require cardinality review
  - high-cardinality debugging moves to logs/traces instead of metrics
