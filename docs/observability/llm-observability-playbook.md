# FrameFast Observability Playbook (LLM-Oriented)

## Purpose
This document is the fast path for agents/tools to inspect FrameFast production observability data with high signal and low ambiguity.

It covers:
- What telemetry exists
- Where it lives
- How to query it via API
- A recommended drilldown flow

## Canonical Data Sources
- Grafana stack: `https://putto11262002.grafana.net`
- Metrics datasource UID: `grafanacloud-prom`
- Logs datasource UID: `grafanacloud-logs`
- Traces datasource UID: `grafanacloud-traces`

## Canonical Dashboards
- `FrameFast API - Metrics`
- `FrameFast Pipeline + Recognition Metrics`
- `FrameFast FTP - Observability`
- `FrameFast Tracing Overview`
- `FrameFast Alerting + SLO`

## Telemetry Inventory

### API / Worker metrics
- `framefast_api_requests_total`
- `framefast_api_errors_total`
- `framefast_api_request_duration_ms`
- `framefast_client_errors_total`
- `framefast_search_e2e_total`
- `framefast_search_e2e_duration_ms`
- `framefast_search_stage_duration_ms`

### Recognition service metrics (Modal)
- `framefast_recognition_requests_total`
- `framefast_recognition_errors_total`
- `framefast_recognition_request_latency_ms`
- `framefast_recognition_inference_latency_ms`
- `framefast_recognition_faces_detected`

### Image pipeline metrics (Modal)
- `framefast_image_pipeline_requests_total`
- `framefast_image_pipeline_errors_total`
- `framefast_image_pipeline_request_latency_ms`
- `framefast_image_pipeline_output_bytes`

### Pipeline V2 consumer metrics (CF Worker)
- `framefast_pipeline_consumer_jobs_total` — jobs processed (labels: `status`)
- `framefast_pipeline_consumer_step_duration_ms` — per-step latency (labels: `step`, `status`)
- `framefast_pipeline_consumer_batch_size` — batch sizes
- `framefast_pipeline_consumer_credit_insufficient_total` — insufficient credit events
- `framefast_pipeline_consumer_credit_refund_total` — credit refunds (labels: `reason`)
- `framefast_pipeline_consumer_queue_wait_ms` — time from R2 event to consumer pickup

### Pipeline V2 callback metrics (CF Worker)
- `framefast_pipeline_callback_jobs_total` — callback results (labels: `status`)
- `framefast_pipeline_callback_step_duration_ms` — per-step latency (labels: `step`, `status`)
- `framefast_pipeline_callback_e2e_duration_ms` — end-to-end job latency
- `framefast_pipeline_callback_faces_detected` — face count per photo
- `framefast_pipeline_callback_credit_refund_total` — refunds on failure (labels: `reason`)

### Orchestrator metrics (Modal)
- `framefast_orchestrator_jobs_total` — jobs by status (labels: `status`)
- `framefast_orchestrator_step_duration_ms` — image_pipeline / recognition step latency (labels: `step`, `status`)
- `framefast_orchestrator_batch_duration_ms` — full batch processing time
- `framefast_orchestrator_errors_total` — errors by step (labels: `step`, `code`)

### FTP metrics
- `framefast_ftp_uploads_total`
- `framefast_ftp_upload_bytes`
- `framefast_ftp_upload_duration_ms`

### Logs
- API structured logs to Loki (`service=framefast-api`)
- FTP structured logs to Loki (`service=framefast-ftp`)
- Client error ingest logs (`source_service=framefast-dashboard|framefast-event|framefast-ios`)
- Pipeline V2 consumer logs (`event=pipeline_consumer_*`)
- Pipeline V2 callback logs (`event=pipeline_callback_*`)
- Trace correlation fields available in logs: `trace_id`, `span_id`, `traceparent`

### Traces
- API spans (`service.name=framefast-api`)
- FTP spans (`service.name=framefast-ftp`)
- Recognition spans (`service.name=framefast-recognition`)
- Image pipeline spans (`service.name=framefast-image-pipeline`)
- Orchestrator spans (`service.name=framefast-orchestrator`)

## Auth and Access Pattern (API-first)

### 1) Obtain Grafana API token from Infisical
Use runtime secret fetch, do not hardcode.

```bash
export GRAFANA_API_TOKEN="$(
  infisical secrets get GRAFANA_API_TOKEN \
    --env=prod \
    --path='/' \
    --projectId=315a1831-a394-47fb-856b-e791dd7e9f9e \
    --plain \
    --silent
)"
export GRAFANA_URL="https://putto11262002.grafana.net"
```

### 2) Health check
```bash
curl -sS -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  "$GRAFANA_URL/api/health"
```

### 3) Query metrics (Prometheus) via Grafana API
```bash
curl -sS \
  -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$GRAFANA_URL/api/ds/query" \
  -d '{
    "queries": [{
      "refId": "A",
      "datasource": {"uid":"grafanacloud-prom"},
      "expr": "sum(rate(framefast_api_errors_total[5m]))",
      "instant": true
    }],
    "from": "now-15m",
    "to": "now"
  }'
```

## High-Value Query Recipes

### API error rate
PromQL:
```promql
sum(rate(framefast_api_errors_total[5m])) / clamp_min(sum(rate(framefast_api_requests_total[5m])), 1)
```

### Pipeline success rate
PromQL:
```promql
sum(rate(framefast_pipeline_consumer_jobs_total{status="ok"}[15m])) / clamp_min(sum(rate(framefast_pipeline_consumer_jobs_total[15m])), 1)
```

### Pipeline E2E p95 latency
PromQL:
```promql
histogram_quantile(0.95, sum by (le) (rate(framefast_pipeline_callback_e2e_duration_ms_milliseconds_bucket[15m])))
```

### Search E2E p95 latency
PromQL:
```promql
histogram_quantile(0.95, sum by (le) (rate(framefast_search_e2e_duration_ms_milliseconds_bucket[15m])))
```

### Pipeline failures by step
PromQL:
```promql
sum by (step) (rate(framefast_pipeline_consumer_step_duration_ms_milliseconds_count{status="error"}[5m]))
```

### Pipeline V2 step latency (avg per step, recent window)
Use `rate()` to get recent averages — raw counters are cumulative and misleading.
PromQL:
```promql
rate(framefast_pipeline_consumer_step_duration_ms_milliseconds_sum{deployment_environment="staging"}[15m])
  / clamp_min(rate(framefast_pipeline_consumer_step_duration_ms_milliseconds_count{deployment_environment="staging"}[15m]), 0.0001)
```

### Pipeline V2 E2E latency (p95)
PromQL:
```promql
histogram_quantile(0.95, sum by (le) (rate(framefast_pipeline_callback_e2e_duration_ms_milliseconds_bucket[15m])))
```

### Pipeline V2 success rate
PromQL:
```promql
sum(rate(framefast_pipeline_consumer_jobs_total{status="ok"}[15m])) / clamp_min(sum(rate(framefast_pipeline_consumer_jobs_total[15m])), 1)
```

### Cardinality budget (FrameFast-only active series)
PromQL:
```promql
count({__name__=~"framefast_.*"})
```

## Recommended Drilldown Order
1. Alert/SLO dashboard: confirm symptom and time window.
2. Service dashboard (API/Pipeline/FTP): isolate failing subsystem.
3. Metrics stage splits: identify hot/failing stage.
4. Traces: follow one failing trace across services.
5. Logs: extract concrete error signature and payload context.

## Trace Query Shortcuts (Tempo / TraceQL)
- Upload pipeline (consumer):
```traceql
{ resource.service.name = "framefast-api" && resource.deployment.environment = "staging" && name =~ "pipeline_consumer.*" }
```
- Upload pipeline (callback):
```traceql
{ resource.service.name = "framefast-api" && resource.deployment.environment = "staging" && name =~ "pipeline_callback.*" }
```
- Orchestrator:
```traceql
{ resource.service.name = "framefast-orchestrator" }
```
- Recognition:
```traceql
{ resource.service.name = "framefast-recognition" } || { span.name = "recognition.inference" }
```
- API entry:
```traceql
{ resource.service.name = "framefast-api" && span.name = "http.request" }
```

### Fetching trace span details via API

**1. Search for trace IDs** (via Grafana datasource query):
```bash
curl -sS -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$GRAFANA_URL/api/ds/query" \
  -d '{
    "queries": [{
      "refId": "A",
      "datasource": {"uid":"grafanacloud-traces"},
      "queryType": "traceql",
      "query": "{ resource.service.name = \"framefast-api\" && resource.deployment.environment = \"staging\" && name =~ \"pipeline_consumer.*\" }",
      "limit": 20,
      "tableType": "traces"
    }],
    "from": "now-30m",
    "to": "now"
  }'
```
Response contains `traceID` and `startTime` in `frames[].data.values`.

**2. Fetch full trace spans** (via Tempo datasource proxy):
```bash
curl -sS -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  "$GRAFANA_URL/api/datasources/proxy/uid/grafanacloud-traces/api/traces/$TRACE_ID"
```
Response is OTLP format: `batches[].scopeSpans[].spans[]` with `name`, `startTimeUnixNano`, `endTimeUnixNano`.
Compute span duration: `(endTimeUnixNano - startTimeUnixNano) / 1e6` → milliseconds.

## Guardrails for Agents
- Never print secret values in output/logs.
- Prefer aggregate queries first, then narrow by `route_group`, `status`, `queue`, `source_service`, `stage`.
- Avoid high-cardinality ad-hoc labels in new metrics.
- For incidents, always include: symptom metric, top failing dimension, one trace exemplar, one representative log line pattern.
