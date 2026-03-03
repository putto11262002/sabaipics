# Grafana Dashboard Plan (Detailed)

This is the implementation plan for FrameFast observability dashboards and alerts, focused on:

- API request/error behavior
- Upload queue and image pipeline behavior
- Face search and recognition behavior
- Cross-service trace drill-down

Assumed data sources:

- Logs: `grafanacloud-putto11262002-logs` (Loki)
- Metrics: `grafanacloud-putto11262002-prom` (Prometheus)
- Traces: `grafanacloud-putto11262002-traces` (Tempo)

## 1) Dashboard: API + Upload Health

### Panel: API request rate (req/s)
Data source: Loki  
Query:

```logql
sum(rate({service="framefast-api",event="request_completed"}[5m]))
```

### Panel: API error rate (failed req/s)
Data source: Loki  
Query:

```logql
sum(rate({service="framefast-api",event=~"request_failed|unhandled_error|result_error"}[5m]))
```

### Panel: API p95 latency (ms)
Data source: Loki  
Query:

```logql
quantile_over_time(
  0.95,
  {service="framefast-api",event="request_completed"}
  | json
  | unwrap duration_ms [5m]
)
```

### Panel: Top slow routes (avg ms, last 15m)
Data source: Loki  
Query:

```logql
topk(
  10,
  avg by (path) (
    avg_over_time(
      {service="framefast-api",event="request_completed"}
      | json
      | unwrap duration_ms [15m]
    )
  )
)
```

### Panel: API status code distribution
Data source: Loki  
Query:

```logql
sum by (status) (
  count_over_time(
    {service="framefast-api",event="request_completed"}
    | json
    | status=~".+" [5m]
  )
)
```

### Panel: Loki ingest/export failures (API + queue logs)
Data source: Loki  
Query:

```logql
sum(
  count_over_time(
    {service="framefast-api"} |= "[observability] Loki push" [5m]
  )
)
```

## 2) Dashboard: Upload + Image Pipeline Deep Dive

### Panel: Queue batches started
Data source: Loki  
Query:

```logql
sum(rate({service="framefast-api",event="photo_batch_start",source="worker-queue"}[5m]))
```

### Panel: Photos processed (throughput)
Data source: Loki  
Query:

```logql
sum(rate({service="framefast-api",event="photo_processed",source="worker-queue"}[5m]))
```

### Panel: Queue processing errors
Data source: Loki  
Query:

```logql
sum(rate({service="framefast-api",event=~"photo_processing_error|photo_batch_failed",source="worker-queue"}[5m]))
```

### Panel: Image pipeline requests total by status
Data source: Prometheus  
Query:

```promql
sum by (status) (
  increase(framefast_image_pipeline_requests_total[5m])
)
```

### Panel: Image pipeline errors by status
Data source: Prometheus  
Query:

```promql
sum by (status) (
  increase(framefast_image_pipeline_errors_total[5m])
)
```

### Panel: Image pipeline request latency p95 (ms)
Data source: Prometheus  
Query:

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(framefast_image_pipeline_request_latency_ms_milliseconds_bucket[5m])
  )
)
```

### Panel: Image pipeline output bytes p95
Data source: Prometheus  
Query:

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(framefast_image_pipeline_output_bytes_bucket[5m])
  )
)
```

### Panel: Image pipeline request volume by service version
Data source: Prometheus  
Query:

```promql
sum by (service_version) (
  increase(framefast_image_pipeline_requests_total[15m])
)
```

## 3) Dashboard: Search + Recognition Deep Dive

### Panel: Recognition requests by source (url vs base64)
Data source: Prometheus  
Query:

```promql
sum by (source, status) (
  increase(framefast_recognition_requests_total[5m])
)
```

### Panel: Recognition errors by source/status
Data source: Prometheus  
Query:

```promql
sum by (source, status) (
  increase(framefast_recognition_errors_total[5m])
)
```

### Panel: Recognition request latency p95 (ms)
Data source: Prometheus  
Query:

```promql
histogram_quantile(
  0.95,
  sum by (le, source) (
    rate(framefast_recognition_request_latency_ms_milliseconds_bucket[5m])
  )
)
```

### Panel: Recognition inference latency p95 (ms)
Data source: Prometheus  
Query:

```promql
histogram_quantile(
  0.95,
  sum by (le, source) (
    rate(framefast_recognition_inference_latency_ms_milliseconds_bucket[5m])
  )
)
```

### Panel: Faces detected distribution (p50/p95)
Data source: Prometheus  
Queries:

```promql
histogram_quantile(
  0.50,
  sum by (le, source) (
    rate(framefast_recognition_faces_detected_bucket[5m])
  )
)
```

```promql
histogram_quantile(
  0.95,
  sum by (le, source) (
    rate(framefast_recognition_faces_detected_bucket[5m])
  )
)
```

### Panel: Selfie search failures (API route level)
Data source: Loki  
Query:

```logql
sum by (path) (
  count_over_time(
    {service="framefast-api",event=~"result_error|request_failed"}
    | json
    | path=~"/participant/.*|/search.*" [10m]
  )
)
```

## 4) Dashboard: Distributed Tracing Overview

Use Tempo trace search + service graph panels.

### Panel: Recent traces for upload flow
Data source: Tempo  
TraceQL:

```traceql
{ span.name = "upload.queue.process" } || { span.name = "photo.queue.process" } || { span.name = "modal.process" }
```

### Panel: Recent traces for recognition
Data source: Tempo  
TraceQL:

```traceql
{ resource.service.name = "framefast-recognition" } || { span.name = "recognition.inference" }
```

### Panel: API root spans
Data source: Tempo  
TraceQL:

```traceql
{ resource.service.name = "framefast-api" && span.name = "http.request" }
```

## 5) Alerts (Initial Set)

Set evaluation interval to 1m for all.

### Alert: API 5xx rate high (10m)
Data source: Loki  
Expression:

```logql
sum(rate({service="framefast-api",event="request_completed"} | json | status=~"5.." [10m])) > 0.2
```

Severity: `critical`  
Suggested for: pager

### Alert: API p95 latency regression
Data source: Loki  
Expression:

```logql
quantile_over_time(
  0.95,
  {service="framefast-api",event="request_completed"} | json | unwrap duration_ms [10m]
) > 1500
```

Severity: `warning`

### Alert: Image pipeline error ratio high
Data source: Prometheus  
Expression:

```promql
(
  sum(increase(framefast_image_pipeline_errors_total[10m]))
/
  clamp_min(sum(increase(framefast_image_pipeline_requests_total[10m])), 1)
) > 0.05
```

Severity: `critical`

### Alert: Recognition error ratio high
Data source: Prometheus  
Expression:

```promql
(
  sum(increase(framefast_recognition_errors_total[10m]))
/
  clamp_min(sum(increase(framefast_recognition_requests_total[10m])), 1)
) > 0.05
```

Severity: `critical`

### Alert: Recognition inference p95 too high
Data source: Prometheus  
Expression:

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(framefast_recognition_inference_latency_ms_milliseconds_bucket[10m]))
) > 2000
```

Severity: `warning`

### Alert: Loki push failures detected
Data source: Loki  
Expression:

```logql
sum(count_over_time({service="framefast-api"} |= "[observability] Loki push" [10m])) > 0
```

Severity: `warning`

## 6) Label/Cardinality Guardrails

- Keep Loki stream labels limited to:
  - `service`, `env`, `event`, `level`, `source`
- Do not add `user_id`, `request_id`, `photo_id`, `trace_id` as stream labels.
- Keep high-cardinality fields in JSON payload only (`| json` parse in queries).

## 7) Recommended Build Order

1. Build `API + Upload Health` dashboard.
2. Build `Upload + Image Pipeline Deep Dive`.
3. Build `Search + Recognition Deep Dive`.
4. Add tracing overview panels.
5. Create alerts and route notification policies.
