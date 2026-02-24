# Sentry Integration Research for Cloudflare Workers Observability

**Date:** 2025-12-07
**Status:** Research Complete
**Decision:** Pending

## Executive Summary

This document provides comprehensive research on integrating Sentry with Cloudflare Workers for observability and distributed tracing. It covers Sentry's capabilities, integration approach, context propagation, and comparison with native Cloudflare Workers OTLP export and Grafana Cloud.

## 1. Sentry Cloudflare Workers Integration

### 1.1 Official SDK Support

Sentry provides an official `@sentry/cloudflare` package specifically designed for Cloudflare Workers and Pages.

**Package:** `@sentry/cloudflare`
**Latest Version:** 10.28.0
**Repository:** https://github.com/getsentry/sentry-javascript

### 1.2 Installation & Configuration

#### Prerequisites

- Cloudflare Workers or Pages project
- Sentry account and project

#### Required Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "compatibility_flags": [
    "nodejs_als", // or "nodejs_compat"
  ],
  "version_metadata": {
    "binding": "CF_VERSION_METADATA",
  },
  "upload_source_maps": true, // Optional but recommended
}
```

#### Basic Setup (Workers)

```typescript
// index.ts
import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
  (env: Env) => {
    const { id: versionId } = env.CF_VERSION_METADATA;

    return {
      dsn: 'https://[key]@[org].ingest.sentry.io/[project]',
      release: versionId,
      sendDefaultPii: true,
      enableLogs: true, // Enable log capture
      tracesSampleRate: 1.0, // 100% tracing
    };
  },
  {
    async fetch(request, env, ctx) {
      // Your worker logic
      return new Response('Hello World!');
    },
  },
);
```

#### Basic Setup (Pages)

```javascript
// functions/_middleware.js
import * as Sentry from '@sentry/cloudflare';

export const onRequest = [
  Sentry.sentryPagesPlugin((context) => ({
    dsn: 'https://[key]@[org].ingest.sentry.io/[project]',
    release: context.env.CF_VERSION_METADATA?.id,
    enableLogs: true,
    tracesSampleRate: 1.0,
  })),
  // Additional middlewares...
];
```

## 2. Distributed Tracing Capabilities

### 2.1 How Sentry Tracing Works

Sentry implements distributed tracing using:

1. **Trace Context Propagation:** Follows W3C Trace Context standards
2. **Automatic Instrumentation:** Built into SDK for common operations
3. **Custom Instrumentation:** Manual span creation for specific operations

#### Core Concepts

- **Trace ID:** Unique identifier for the entire distributed trace (generated in root span)
- **Parent ID:** Span ID of the parent operation
- **Span ID:** Unique identifier for each operation/span
- **Transaction:** Root span representing a complete operation (e.g., HTTP request)

### 2.2 W3C Trace Context Support

**Status:** Sentry supports W3C `traceparent` header propagation.

As of recent releases, Sentry's JavaScript SDKs include support for the W3C `traceparent` header format. This enables:

- Compatibility with OpenTelemetry and other W3C-compliant systems
- Standard trace context propagation across service boundaries
- Automatic extraction and injection of trace headers

**Note:** This feature may need to be explicitly enabled in some SDKs:

```javascript
// Example configuration (varies by SDK)
Sentry.init({
  // ...
  enableW3CTraceContext: true, // Check SDK docs for exact flag
});
```

### 2.3 Context Propagation Across Async Boundaries

#### HTTP Requests

Sentry automatically propagates trace context via HTTP headers:

```
traceparent: 00-[trace-id]-[parent-span-id]-01
baggage: sentry-trace_id=[trace-id],sentry-environment=production,...
```

#### Queue Message Propagation (Manual)

For Cloudflare Queues, you must **manually** propagate trace context:

```typescript
// Producer (in Worker fetch handler)
import * as Sentry from "@sentry/cloudflare";

async fetch(request, env, ctx) {
  // Get current trace context
  const span = Sentry.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  const spanId = span?.spanContext().spanId;

  // Send message with trace metadata
  await env.MY_QUEUE.send({
    data: { /* payload */ },
    meta: {
      traceId: traceId,
      parentSpanId: spanId,
    }
  });
}

// Consumer (queue handler)
async queue(batch, env, ctx) {
  for (const message of batch.messages) {
    const { traceId, parentSpanId } = message.body.meta;

    // Create child span with parent context
    await Sentry.startSpan(
      {
        op: "queue.process",
        name: "Process Queue Message",
        traceId: traceId,
        parentSpanId: parentSpanId,
      },
      async () => {
        // Process message
      }
    );
  }
}
```

**Important:** Sentry does NOT automatically propagate trace context to Cloudflare Queues. This must be done manually by:

1. Extracting trace context in producer
2. Attaching it to message payload
3. Recreating span context in consumer

## 3. Performance Monitoring Features

### 3.1 Automatic Instrumentation

Sentry **automatically** instruments:

- HTTP/HTTPS requests (via `fetch`)
- Worker handler execution (fetch, scheduled, queue, email, etc.)
- Execution duration and CPU time
- Errors and exceptions

### 3.2 What's NOT Automatically Instrumented

The following require **manual instrumentation**:

- **D1 Database Queries** - No automatic spans for D1
- **R2 Storage Operations** - No automatic spans for R2
- **KV Operations** - No automatic spans for Workers KV
- **Durable Objects Calls** - No automatic spans for DO invocations
- **Custom Business Logic** - Any internal function calls

### 3.3 Custom Instrumentation

For database queries, R2 operations, and custom code:

```typescript
import * as Sentry from '@sentry/cloudflare';

// D1 Query Example
async function getUserById(db: D1Database, userId: string) {
  return await Sentry.startSpan(
    {
      op: 'db.query',
      name: 'SELECT user by ID',
      attributes: {
        'db.system': 'd1',
        'db.statement': 'SELECT * FROM users WHERE id = ?',
      },
    },
    async () => {
      return await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    },
  );
}

// R2 Storage Example
async function uploadImage(r2: R2Bucket, key: string, data: ArrayBuffer) {
  return await Sentry.startSpan(
    {
      op: 'storage.put',
      name: 'Upload to R2',
      attributes: {
        'storage.system': 'r2',
        'storage.key': key,
        'storage.size': data.byteLength,
      },
    },
    async () => {
      return await r2.put(key, data);
    },
  );
}

// Custom Business Logic
async function processPayment(amount: number) {
  return await Sentry.startSpan(
    {
      op: 'payment.process',
      name: 'Process Payment',
      attributes: {
        'payment.amount': amount,
      },
    },
    async () => {
      // Payment processing logic
    },
  );
}
```

### 3.4 Well-Known Span Operations

Sentry maintains a list of well-known span operations for better visualization:

- `http.client` - Outgoing HTTP requests
- `db` / `db.query` / `db.sql.query` - Database operations
- `cache.get` / `cache.put` - Cache operations
- `function` - Function execution
- `queue.process` - Queue message processing
- `storage.put` / `storage.get` - Storage operations

**Recommendation:** Use these standardized operation names for better Sentry UI integration.

## 4. Sentry vs Cloudflare Native OTLP Export

### 4.1 Cloudflare Workers Native Tracing

**Current Status (Dec 2025):**

- **Open Beta** - Free during beta period
- **Pricing starts:** January 15, 2026
- **Automatic instrumentation** for Workers runtime operations
- **No trace context propagation** between services yet (planned)

#### What Cloudflare Auto-Instruments

- Worker handler invocations
- Fetch subrequests
- R2 Object Storage operations
- Workers KV operations
- D1 Database queries
- Durable Objects calls
- Queue operations
- Cron triggers
- CPU time and wall time

#### Limitations (as of Dec 2025)

❌ **No automatic trace context propagation** between:

- Worker → Queue → Consumer
- Worker → Durable Object
- Worker → External services

❌ **No cross-platform trace linking** (can't link to non-Cloudflare services)

❌ **Limited custom instrumentation** (manual API coming soon)

✅ **Planned:** W3C Trace Context standard support

### 4.2 Feature Comparison

| Feature                       | Cloudflare Native   | Sentry                | Grafana Cloud           |
| ----------------------------- | ------------------- | --------------------- | ----------------------- |
| **Auto-instrumentation**      | ✅ Excellent        | ⚠️ Basic (fetch only) | ✅ Excellent (via OTLP) |
| **D1 Query Tracing**          | ✅ Automatic        | ❌ Manual only        | ✅ Automatic            |
| **R2 Operation Tracing**      | ✅ Automatic        | ❌ Manual only        | ✅ Automatic            |
| **KV Operation Tracing**      | ✅ Automatic        | ❌ Manual only        | ✅ Automatic            |
| **Trace Context Propagation** | ❌ Coming soon      | ✅ W3C Support        | ✅ W3C Support          |
| **Queue Context Propagation** | ❌ Coming soon      | ⚠️ Manual only        | ✅ Automatic            |
| **Error Linking**             | ❌ Separate systems | ✅ Built-in           | ⚠️ Via correlation      |
| **Session Replay**            | ❌ Not available    | ✅ Available          | ❌ Not available        |
| **Custom Dashboards**         | ⚠️ Limited          | ✅ Available          | ✅ Excellent            |
| **Alerting**                  | ⚠️ Basic            | ✅ Advanced           | ✅ Advanced             |
| **Cost**                      | $0.05/1M events     | Varies (see below)    | Free tier generous      |

### 4.3 Cost Comparison

#### Cloudflare Workers Tracing

- **Free tier:** Not available (Workers Free plan)
- **Workers Paid:** 10M events/month included, then $0.05 per 1M events
- **Pricing starts:** January 15, 2026

#### Sentry

- **Free tier:** Limited events (5K errors + 10K transactions/month for 1 user)
- **Team plan:** Starting at $26/month (50K+ events)
- **Scales with:** Event volume, team size, retention period
- **Typical cost for 100M exceptions (90 days):** ~$30,000

#### Grafana Cloud

- **Free tier (Forever):**
  - 10K Prometheus metrics series
  - 50GB logs
  - 50GB traces
  - 50GB profiles
  - 500 VUh k6 testing
- **Paid plans:** Usage-based, scales with data volume
- **Typical cost:** Much lower than Sentry for high-volume tracing

### 4.4 Cost Analysis Example

**Scenario:** 10M requests/month, 100% trace sampling

| Platform          | Monthly Cost | Notes                                    |
| ----------------- | ------------ | ---------------------------------------- |
| Cloudflare Native | ~$0.50       | 10M events @ $0.05/1M                    |
| Grafana Cloud     | $0 - $50     | Likely within free tier or low paid tier |
| Sentry            | $80+         | Business plan needed for volume          |

**Recommendation:** For pure tracing, Cloudflare native + Grafana Cloud is significantly cheaper than Sentry.

## 5. Why Use Sentry vs Native OTLP?

### 5.1 Sentry Advantages

✅ **Unified Error + Performance Monitoring**

- Single platform for errors, performance, and user context
- Errors automatically linked to traces
- Session replay integration

✅ **Superior Developer Experience**

- Excellent UI for error debugging
- Release tracking and deployment notifications
- Issue assignment and workflow management
- GitHub, Jira, Slack integrations

✅ **Rich Error Context**

- Stack traces with source maps
- Breadcrumbs (user actions leading to error)
- User context, tags, custom data
- Error fingerprinting and grouping

✅ **Production-Ready Today**

- Mature, stable platform
- Trace context propagation works now
- No beta limitations

### 5.2 Grafana Cloud Advantages

✅ **Better Automatic Instrumentation**

- D1, R2, KV operations auto-traced
- Queue context propagation automatic
- More comprehensive out-of-the-box

✅ **Lower Cost at Scale**

- Generous free tier (50GB traces)
- More predictable pricing
- Better for high-volume tracing

✅ **Open Standards**

- Full OpenTelemetry compatibility
- Vendor-neutral
- Works with any OTLP source

✅ **Superior Observability**

- Logs, traces, metrics unified
- Powerful querying (LogQL, TraceQL)
- Grafana dashboards
- Correlation across telemetry types

### 5.3 Cloudflare Native Advantages

✅ **Zero Configuration**

- Built into runtime
- No SDK installation
- Automatic instrumentation

✅ **Lowest Cost**

- Cheapest option for pure tracing
- No external service fees

✅ **Best Performance Data**

- Direct access to all runtime metrics
- CPU time, wall time, memory

❌ **Current Limitations**

- No trace context propagation (yet)
- Limited custom instrumentation
- Can't link to external services
- Separate from error tracking

## 6. Recommended Architecture

### 6.1 Hybrid Approach (Best of Both Worlds)

**For Production SabaiPics API:**

1. **Use Cloudflare Native OTLP → Grafana Cloud for Tracing**
   - Enable native Workers tracing
   - Export OTLP to Grafana Cloud
   - Get automatic D1, R2, KV instrumentation
   - Use pre-built dashboards

2. **Use Sentry for Error Monitoring**
   - Install `@sentry/cloudflare` for error tracking
   - Disable tracing in Sentry (set `tracesSampleRate: 0`)
   - Get superior error debugging experience
   - Link errors to Grafana traces via trace ID

3. **Manual Correlation**
   - Add trace ID to Sentry error context
   - Link from Sentry error to Grafana trace

### 6.2 Configuration Example

#### Wrangler Config

```jsonc
{
  "compatibility_flags": ["nodejs_als"],
  "version_metadata": {
    "binding": "CF_VERSION_METADATA",
  },
  "observability": {
    "traces": {
      "enabled": true,
      "destinations": ["grafana-traces"],
    },
    "logs": {
      "enabled": true,
      "destinations": ["grafana-logs"],
    },
  },
}
```

#### Worker Setup

```typescript
import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    release: env.CF_VERSION_METADATA?.id,
    sendDefaultPii: false,
    enableLogs: false, // Logs go to Grafana
    tracesSampleRate: 0, // Tracing handled by Cloudflare native

    // Add trace ID to Sentry events for correlation
    beforeSend(event, hint) {
      // Get trace ID from current span (if any)
      const traceId = getTraceIdFromCloudflareContext();
      if (traceId) {
        event.contexts = {
          ...event.contexts,
          trace: { trace_id: traceId },
        };
      }
      return event;
    },
  }),
  {
    async fetch(request, env, ctx) {
      // Your application logic
    },
  },
);
```

## 7. Integration with OpenTelemetry

### 7.1 Sentry + OpenTelemetry

Sentry provides **limited** OpenTelemetry integration:

- Can ingest OTLP data via special endpoint
- Supports W3C Trace Context propagation
- But Sentry SDK is **not** based on OpenTelemetry

**OTLP Ingest Endpoint:**

```
https://{HOST}/api/{PROJECT_ID}/integration/otlp/v1/traces
https://{HOST}/api/{PROJECT_ID}/integration/otlp/v1/logs
```

**Limitation:** You can't use OpenTelemetry SDK with Sentry directly; you must use Sentry's proprietary SDKs.

### 7.2 Cloudflare Native + OpenTelemetry

Cloudflare Workers native tracing is **OTLP-based**:

- Exports standard OpenTelemetry spans
- Compatible with any OTLP collector
- Follows OpenTelemetry semantic conventions

**Recommended Stack:**

```
Cloudflare Workers → OTLP → Grafana Cloud (Tempo/Loki)
```

## 8. Decision Matrix

### 8.1 Choose Sentry If:

- You prioritize **error debugging** over pure tracing
- You want **unified error + performance** in one tool
- You need **session replay** and user context
- Your team is familiar with Sentry
- Cost is not primary concern
- You need production-ready trace propagation **today**

### 8.2 Choose Grafana Cloud If:

- You prioritize **observability depth** (logs + traces + metrics)
- You want **automatic instrumentation** for D1, R2, KV
- You need **lower cost** at scale
- You prefer **open standards** (OpenTelemetry)
- You want powerful querying (TraceQL, LogQL)

### 8.3 Choose Cloudflare Native Only If:

- You only need basic tracing
- You don't need cross-service trace propagation
- You want the absolute lowest cost
- You're okay with beta limitations

## 9. Recommendations for SabaiPics

### 9.1 Phase 1: Start with Hybrid Approach

**Rationale:**

- Get best automatic instrumentation from Cloudflare native
- Get best error debugging from Sentry
- Stay within free tiers initially

**Setup:**

1. Enable Cloudflare native OTLP export to Grafana Cloud
2. Install Sentry for error monitoring only (disable tracing)
3. Manually add trace IDs to Sentry errors for correlation

**Cost:** Free tier for both platforms during development

### 9.2 Phase 2: Evaluate After Launch

**Metrics to Track:**

- Error volume and types
- Trace volume and sampling needs
- Monthly costs for each platform
- Developer experience and time saved

**Decision Points:**

- If errors are primary concern → Keep Sentry
- If observability depth needed → Invest in Grafana Cloud
- If cost becomes issue → Consider Cloudflare-only approach

### 9.3 Not Recommended: Sentry for Tracing

**Reasons:**

- Manual instrumentation burden for D1, R2, KV
- Higher cost than alternatives
- No better than native Cloudflare + Grafana for pure tracing
- Sentry's strength is error monitoring, not distributed tracing

## 10. Implementation Guide

### 10.1 Grafana Cloud Setup

1. **Create Grafana Cloud Account** (free tier)
2. **Get OTLP Credentials:**
   - Go to Connections → Add new connection → OpenTelemetry
   - Copy OTLP endpoint: `https://otlp-gateway-{region}.grafana.net/otlp`
   - Create access token for authentication

3. **Add Destinations in Cloudflare Dashboard:**
   - Navigate to Workers & Pages → Observability → Destinations
   - Add trace destination:
     - Endpoint: `https://otlp-gateway-{region}.grafana.net/otlp/v1/traces`
     - Header: `Authorization: Basic {base64_token}`
   - Add log destination:
     - Endpoint: `https://otlp-gateway-{region}.grafana.net/otlp/v1/logs`
     - Header: `Authorization: Basic {base64_token}`

4. **Enable in Wrangler Config:**

   ```jsonc
   {
     "observability": {
       "traces": {
         "enabled": true,
         "destinations": ["grafana-traces"],
       },
       "logs": {
         "enabled": true,
         "destinations": ["grafana-logs"],
       },
     },
   }
   ```

5. **Install Cloudflare Workers Integration:**
   - In Grafana Cloud, go to Integrations
   - Search for "Cloudflare Workers"
   - Install pre-built dashboards

### 10.2 Sentry Setup (Error Monitoring)

1. **Install SDK:**

   ```bash
   pnpm add @sentry/cloudflare
   ```

2. **Initialize in Worker:**

   ```typescript
   import * as Sentry from '@sentry/cloudflare';

   export default Sentry.withSentry(
     (env) => ({
       dsn: env.SENTRY_DSN,
       release: env.CF_VERSION_METADATA?.id,
       environment: env.ENVIRONMENT,
       tracesSampleRate: 0, // Disable tracing

       // Correlation with Grafana traces
       beforeSend(event) {
         // Add trace ID from request context
         const traceId = getTraceIdFromHeaders(request);
         if (traceId) {
           event.contexts = {
             ...event.contexts,
             trace: { trace_id: traceId },
           };
           event.tags = {
             ...event.tags,
             grafana_trace: `https://your-org.grafana.net/explore?trace=${traceId}`,
           };
         }
         return event;
       },
     }),
     // Worker handlers...
   );
   ```

## 11. References

### Official Documentation

- **Sentry Cloudflare Docs:** https://docs.sentry.io/platforms/javascript/guides/cloudflare/
- **Cloudflare OTLP Export:** https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- **Grafana Cloud Workers Integration:** https://grafana.com/blog/2025/12/04/send-opentelemetry-traces-and-logs-from-cloudflare-workers-to-grafana-cloud/
- **Sentry Distributed Tracing:** https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/

### Key Findings

- **Cloudflare native tracing lacks trace context propagation** (as of Dec 2025)
- **Sentry requires manual instrumentation** for D1, R2, KV operations
- **Grafana Cloud offers best value** for distributed tracing at scale
- **Hybrid approach recommended** for production (Grafana + Sentry)

---

**Next Steps:**

1. Set up Grafana Cloud free tier account
2. Configure OTLP destinations in Cloudflare dashboard
3. Test native tracing with sample Worker
4. Evaluate developer experience before committing to Sentry
