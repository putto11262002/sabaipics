# Observability Implementation

**Status:** Complete
**Last Updated:** 2025-12-07

---

## Overview

Defines HOW to implement unified observability across all services (React dashboard, Cloudflare Workers API, Go FTP server, Queue consumers) using Sentry for distributed tracing and error tracking.

**Performance targets defined in:** `00_flows.md` (upload <2s, processing <10s, search <3s)

---

## Critical Decision 1: Unified Observability Architecture

### Context

Need distributed tracing across heterogeneous services (React, Cloudflare Workers, Go) with context propagation that works today.

**Challenge:** Cloudflare Workers native tracing (Dec 2025) doesn't support automatic trace context propagation between services (Worker → Queue, Worker → external services).

### Decision

**Use Sentry for unified observability** across all services.

**Why Sentry:**

- ✅ Context propagation works today (vs Cloudflare native coming Jan 2026)
- ✅ Multi-language support (JavaScript, Go)
- ✅ Distributed tracing with W3C-compatible headers
- ✅ Manual trace context propagation for queues
- ✅ Excellent error debugging UI
- ✅ Session replay for frontend debugging

**Project Structure:**

| Project               | Service                | Technology         |
| --------------------- | ---------------------- | ------------------ |
| `sabaipics-dashboard` | Photographer dashboard | React + Vite       |
| `sabaipics-api`       | API + Queue consumers  | Cloudflare Workers |
| `sabaipics-ftp`       | FTP upload service     | Go + SFTPGo        |

**Sampling Strategy:**

| Operation               | Sample Rate | Why                         |
| ----------------------- | ----------- | --------------------------- |
| Upload, Search, Payment | 100%        | Critical user paths         |
| Admin operations        | 50%         | Important but less frequent |
| Health checks           | 1%          | High volume, low value      |
| Default                 | 20%         | Balance cost and coverage   |

### Pattern

**Trace Flow:**

```
Dashboard (React) → API (Workers) → FTP (Go) → Queue → Consumer
     │                  │              │          │         │
  Sentry JS         Sentry JS      Sentry Go   Manual    Manual
  (Project:         (Project:      (Project:   message   continue
   dashboard)        api)           ftp)       context   trace
     │                  │              │          │         │
     └──────────────────┴──────────────┴──────────┴─────────┘
              Single trace-id propagates across all services
```

---

## Critical Decision 2: Cloudflare Workers Integration

### Context

Cloudflare Workers require manual instrumentation for D1, R2, Queue, and Durable Object operations.

### Decision

Use `@sentry/cloudflare` SDK with manual span creation for Cloudflare-specific operations.

### Pattern

**Setup:**

1. Install SDK: `npm install @sentry/cloudflare`
2. Add compatibility flag to `wrangler.toml`:
   ```toml
   compatibility_flags = ["nodejs_als"]
   ```
3. Wrap worker with `withSentry()`:

   ```javascript
   import * as Sentry from '@sentry/cloudflare';

   export default {
     async fetch(request, env, ctx) {
       return withSentry({ dsn: env.SENTRY_DSN }, request, env, ctx, () => {
         // Worker code
       });
     },
   };
   ```

4. Configure Sentry:
   ```javascript
   Sentry.init({
     dsn: env.SENTRY_DSN,
     environment: env.ENVIRONMENT,
     tracesSampleRate: 0.2,
     tracesSampler: (samplingContext) => {
       if (ctx.name.includes('upload')) return 1.0;
       if (ctx.name.includes('health')) return 0.01;
       return 0.2;
     },
   });
   ```

**Manual Instrumentation Required:**

| Operation      | Pattern                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| D1 Query       | `Sentry.startSpan({ op: 'db.query', name: 'SELECT credits' }, async () => { ... })` |
| R2 Upload      | `Sentry.startSpan({ op: 'r2.put', name: 'Upload photo' }, async () => { ... })`     |
| Queue Send     | Attach trace context to message body (see Decision 4)                               |
| Business Logic | `Sentry.startSpan({ op: 'business.credit_deduction' }, async () => { ... })`        |

**Trace Propagation:**

- **Incoming:** Automatic extraction from `sentry-trace` + `baggage` headers
- **Outgoing HTTP:** Automatic header injection to configured targets
- **Queue:** Manual (see Critical Decision 4)

**CORS Configuration:**

Add to allowed headers:

```javascript
{
  'Access-Control-Allow-Headers': 'sentry-trace, baggage, ...'
}
```

Configure trace propagation targets:

```javascript
Sentry.init({
  tracePropagationTargets: [
    'localhost',
    /^https:\/\/api\.sabaipics\.com/,
    /^https:\/\/ftp\.sabaipics\.com/,
  ],
});
```

### References

| Topic                  | URL                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Sentry Cloudflare SDK  | https://docs.sentry.io/platforms/javascript/guides/cloudflare/                              |
| Manual Instrumentation | https://docs.sentry.io/platforms/javascript/tracing/instrumentation/custom-instrumentation/ |
| Configuration Options  | https://docs.sentry.io/platforms/javascript/configuration/options/                          |

---

## Critical Decision 3: Go FTP Server Integration

### Context

FTP server (SFTPGo) needs to create root spans and propagate traces to Workers API.

### Decision

Use `github.com/getsentry/sentry-go` SDK with HTTP middleware for automatic trace extraction.

### Pattern

**Setup:**

1. Install SDK: `go get github.com/getsentry/sentry-go`
2. Initialize Sentry in `main()`:

   ```go
   import "github.com/getsentry/sentry-go"

   func main() {
       err := sentry.Init(sentry.ClientOptions{
           Dsn: os.Getenv("SENTRY_DSN"),
           Environment: os.Getenv("ENVIRONMENT"),
           Release: "sabaipics-ftp@1.0.0",
           EnableTracing: true,
           TracesSampleRate: 0.2,
       })
       defer sentry.Flush(2 * time.Second)
   }
   ```

3. Wrap HTTP handlers with Sentry middleware:

   ```go
   import sentryhttp "github.com/getsentry/sentry-go/http"

   handler := sentryhttp.New(sentryhttp.Options{}).Handle(yourHandler)
   http.Handle("/upload", handler)
   ```

**Trace Propagation:**

| Direction    | Pattern                                                 |
| ------------ | ------------------------------------------------------- |
| **Incoming** | Automatic extraction from `sentry-trace` header         |
| **Outgoing** | Add headers: `span.ToSentryTrace()`, `span.ToBaggage()` |

**SFTPGo Integration:**

Configure SFTPGo webhooks to POST to Sentry-instrumented endpoint:

```json
{
  "event_manager": {
    "actions": [
      {
        "name": "upload_webhook",
        "type": "http",
        "trigger": "upload",
        "http_config": {
          "endpoint": "https://api.sabaipics.com/webhooks/ftp-upload",
          "method": "POST"
        }
      }
    ]
  }
}
```

Webhook handler creates transaction:

```go
func sftpgoWebhookHandler(w http.ResponseWriter, r *http.Request) {
    transaction := sentry.StartTransaction(r.Context(), "sftpgo.webhook")
    defer transaction.Finish()

    // Process webhook, call API with trace propagation
}
```

**Contextual Data:**

Add tags and data to spans:

```go
span.SetTag("photographer_id", photographerID)
span.SetTag("event_id", eventID)
span.SetData("file.size", fileSize)
span.SetData("file.name", fileName)
```

### References

| Topic                | URL                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- |
| Sentry Go SDK        | https://docs.sentry.io/platforms/go/                                                   |
| HTTP Middleware      | https://docs.sentry.io/platforms/go/tracing/instrumentation/automatic-instrumentation/ |
| Trace Propagation    | https://docs.sentry.io/platforms/go/tracing/trace-propagation/                         |
| SFTPGo Event Actions | https://docs.sftpgo.com/latest/custom-actions/                                         |

---

## Critical Decision 4: Distributed Trace Propagation

### Context

Traces must flow seamlessly: Dashboard → API → FTP → Queue → Consumer with single trace-id.

**Challenge:** Async boundaries (queues) require manual trace context propagation.

### Decision

Automatic propagation for HTTP, manual propagation for queues.

### Pattern

**HTTP Trace Propagation (Automatic):**

Headers automatically added/extracted:

- `sentry-trace`: Contains `{trace_id}-{span_id}-{sampled}`
- `baggage`: W3C Baggage with dynamic sampling context

No manual work needed for HTTP calls.

**Queue Trace Propagation (Manual):**

**Producer (API Worker):**

```javascript
// Get current span
const span = Sentry.getActiveSpan();

// Attach trace context to message
await env.QUEUE.send({
  photo_id: photoID,
  event_id: eventID,
  trace_context: {
    'sentry-trace': span.toSentryTrace(),
    baggage: span.toBaggage(),
  },
});
```

**Consumer (Queue Worker):**

```javascript
async queue(batch, env) {
  for (const message of batch.messages) {
    const { trace_context } = message.body;

    // Continue trace
    Sentry.continueTrace(
      {
        sentryTrace: trace_context['sentry-trace'],
        baggage: trace_context['baggage']
      },
      () => {
        Sentry.startSpan({ name: 'queue.process_photo' }, async () => {
          // Process photo with full trace context
        });
      }
    );
  }
}
```

**Correlation Fields (All Services):**

Include in all logs and spans:

- `trace.id` - Links distributed trace across services
- `span.id` - Current operation identifier
- `photographer.id` - Business context
- `event.id` - Business context
- `photo.id` - Resource context (when applicable)

### References

| Topic                 | URL                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Trace Propagation     | https://docs.sentry.io/platforms/javascript/tracing/trace-propagation/                         |
| Queue Instrumentation | https://docs.sentry.io/platforms/javascript/tracing/distributed-tracing/#queue-instrumentation |
| Continue Trace API    | https://docs.sentry.io/platforms/javascript/tracing/trace-propagation/#continuing-a-trace      |

---

## Critical Decision 5: Error Tracking with Context

### Context

Errors need full context (stack traces, tags, business data) for effective debugging across all services.

### Decision

Structured error capture with contextual enrichment and privacy protection.

### Pattern

**Error Structure:**

| Field         | Purpose                    | Example                                             |
| ------------- | -------------------------- | --------------------------------------------------- |
| `type`        | Error class name           | `InsufficientCreditsError`                          |
| `message`     | Human-readable description | "Photographer has 0 credits remaining"              |
| `code`        | Machine-readable code      | `INSUFFICIENT_CREDITS`                              |
| `stack`       | Parsed call stack          | Array of {function, file, line, column}             |
| `tags`        | Searchable metadata        | `{photographer_id, event_id, upload_source}`        |
| `extra`       | Additional context         | `{file_size_bytes, duration_ms, credits_available}` |
| `breadcrumbs` | Events leading to error    | Array of user actions, API calls                    |

**Error Capture Pattern:**

```javascript
// Automatic capture
throw new InsufficientCreditsError('Photographer has 0 credits');

// Manual capture with context
Sentry.captureException(error, {
  tags: {
    photographer_id: photographerID,
    event_id: eventID,
  },
  extra: {
    credits_available: 0,
    credits_required: 1,
    file_size_bytes: 10485760,
  },
});
```

**Privacy Protection:**

| Never Log                   | Safe to Log               |
| --------------------------- | ------------------------- |
| ❌ File contents            | ✅ Error types, codes     |
| ❌ Passwords, tokens        | ✅ Stack traces           |
| ❌ API keys                 | ✅ IDs (hashed if needed) |
| ❌ PII (full names, emails) | ✅ File names, sizes      |
| ❌ Face data                | ✅ Timestamps, durations  |

**Scrubbing Pattern:**

```javascript
Sentry.init({
  beforeSend(event, hint) {
    // Remove sensitive data
    if (event.extra?.password) delete event.extra.password;
    if (event.extra?.api_key) delete event.extra.api_key;

    // Hash IDs if needed
    if (event.tags?.user_id) {
      event.tags.user_id_hash = hash(event.tags.user_id);
      delete event.tags.user_id;
    }

    return event;
  },
});
```

**Error Fingerprinting:**

Group errors by type + location:

```javascript
Sentry.init({
  beforeSend(event) {
    // Custom fingerprinting
    event.fingerprint = [
      event.exception?.values?.[0]?.type,
      event.exception?.values?.[0]?.value,
      event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
      event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno,
    ];
    return event;
  },
});
```

### References

| Topic                    | URL                                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| Error Tracking           | https://docs.sentry.io/platforms/javascript/usage/                          |
| Privacy & Data Scrubbing | https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/ |
| Error Fingerprinting     | https://docs.sentry.io/platforms/javascript/usage/sdk-fingerprinting/       |
| Breadcrumbs              | https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/   |

---

## Critical Decision 6: React Frontend Integration

### Context

Frontend needs error tracking, performance monitoring, and session replay for user debugging.

### Decision

Use `@sentry/react` with privacy-first session replay configuration.

### Pattern

**Setup:**

```javascript
import * as Sentry from '@sentry/react';
import { createBrowserRouter } from 'react-router-dom';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true, // Block all images/videos (face photos)
      replaysOnErrorSampleRate: 0.1, // 10% of errors
      replaysSessionSampleRate: 0.01, // 1% of sessions
    }),
  ],
  tracesSampleRate: 0.2,
  tracePropagationTargets: ['localhost', /^https:\/\/api\.sabaipics\.com/],
});

// Instrument router
const router = Sentry.wrapCreateBrowserRouter(createBrowserRouter);
```

**Core Web Vitals:**

Automatically tracked:

- LCP (Largest Contentful Paint) - Target: <2.5s
- INP (Interaction to Next Paint) - Target: <200ms
- CLS (Cumulative Layout Shift) - Target: <0.1
- TTFB (Time to First Byte) - Target: <800ms

**Custom Measurements:**

```javascript
Sentry.startSpan({ name: 'upload.photos' }, () => {
  span.setMeasurement('upload.count', photoCount, 'none');
  span.setMeasurement('upload.total_bytes', totalBytes, 'byte');
  span.setMeasurement('upload.duration', durationMs, 'millisecond');
});
```

### References

| Topic            | URL                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Sentry React SDK | https://docs.sentry.io/platforms/javascript/guides/react/                                                     |
| Session Replay   | https://docs.sentry.io/platforms/javascript/session-replay/                                                   |
| Core Web Vitals  | https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#web-vitals |

---

## Critical Decision 7: Complementary Tools

### Context

Sentry focuses on errors and traces. Need complementary tools for metrics and logs.

### Decision

**Hybrid observability stack:**

- **Sentry:** Errors + distributed tracing
- **Cloudflare Analytics Engine:** Business metrics
- **Grafana Loki:** Log aggregation (FTP server)

**Why Hybrid:**

- Sentry excels at debugging, not metrics dashboards
- Analytics Engine better for high-volume business metrics
- Loki better for log search and aggregation
- Keeps costs optimized

### Pattern

**Analytics Engine Dataset:**

```javascript
env.ANALYTICS.writeDataPoint({
  doubles: [fileSize, durationMs],
  blobs: [photographerID, eventID, uploadSource, status],
});
```

Schema:

- `timestamp` - Automatic
- `file_size_bytes` - double
- `duration_ms` - double
- `photographer_id` - blob (indexed)
- `event_id` - blob (indexed)
- `upload_source` - blob ('ftp' | 'web' | 'desktop')
- `status` - blob ('success' | 'failed')

**Correlation with Sentry:**

Add `trace_id` to Analytics Engine events:

```javascript
env.ANALYTICS.writeDataPoint({
  doubles: [fileSize, durationMs],
  blobs: [photographerID, eventID, traceID, status],
});
```

Enables linking from metrics dashboard → Sentry trace for debugging.

**Grafana Loki (FTP Server Logs):**

Forward structured JSON logs from Go FTP server:

```go
log.Info().
    Str("trace_id", traceID).
    Str("connection_id", connID).
    Str("event", "file.uploaded").
    Int64("file_size", fileSize).
    Msg("File uploaded successfully")
```

### References

| Topic                   | URL                                                           |
| ----------------------- | ------------------------------------------------------------- |
| Analytics Engine        | https://developers.cloudflare.com/analytics/analytics-engine/ |
| Grafana Loki            | https://grafana.com/docs/loki/                                |
| Structured Logging (Go) | https://github.com/rs/zerolog                                 |

---

## Critical Decision 8: Cost Management

### Context

Sentry pricing scales with performance units (transactions + spans).

### Decision

Dynamic sampling strategy with cost monitoring.

### Pattern

**Sampling Strategy:**

```javascript
tracesSampler: (samplingContext) => {
  // Critical paths: 100%
  if (ctx.name.includes('upload')) return 1.0;
  if (ctx.name.includes('search')) return 1.0;
  if (ctx.name.includes('payment')) return 1.0;

  // Errors: Always capture
  if (ctx.parentSampled === true) return 1.0;

  // Health checks: 1%
  if (ctx.name === 'GET /health') return 0.01;

  // Admin endpoints: 50%
  if (ctx.name.startsWith('admin.')) return 0.5;

  // Default: 20%
  return 0.2;
};
```

**Cost Estimate (10M requests/month):**

- Transactions: ~10M
- Spans: ~50M (avg 5 spans per transaction)
- Performance Units: ~10M + (50M × 0.05) = ~12.5M units

**Sentry Pricing:**

- Team Plan: $26/month
- Additional units: $10 per 100K units
- Monthly cost: $26 + (~125 × $10) = **~$1,276/month**

**Cost Optimization:**

| Strategy                         | Savings         |
| -------------------------------- | --------------- |
| Filter health checks (1% vs 20%) | ~$200/month     |
| Drop low-value spans             | ~$300/month     |
| Filter noisy errors              | ~$50/month      |
| **Optimized total**              | **~$726/month** |

**Budget Thresholds:**

- Alert when >80% of monthly quota
- Review sampling rates monthly
- Consider hybrid approach if costs exceed $1,000/month

### References

| Topic                  | URL                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Sentry Pricing         | https://sentry.io/pricing/                                                                 |
| Sampling Configuration | https://docs.sentry.io/platforms/javascript/configuration/sampling/                        |
| Performance Units      | https://docs.sentry.io/product/pricing/quotas/manage-event-stream-guide/#performance-units |

---

## References

**Connected Primary Docs:**

- `00_flows.md` - Performance targets (upload <2s, processing <10s, search <3s)
- `00_business_rules.md` - Error codes and validation rules
- `03_api_design.md` - API endpoints and error responses

**Connected Supporting Docs:**

- `05_ftp_upload.md` - FTP-specific observability integration
- `06_websocket.md` - WebSocket notification patterns
- `02_auth.md` - Authentication flows for user correlation

**Official Documentation:**

- Sentry JavaScript: https://docs.sentry.io/platforms/javascript/
- Sentry Go: https://docs.sentry.io/platforms/go/
- Sentry Cloudflare: https://docs.sentry.io/platforms/javascript/guides/cloudflare/
- Cloudflare Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/
- Grafana Loki: https://grafana.com/docs/loki/
