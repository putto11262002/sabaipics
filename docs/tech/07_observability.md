# Observability Implementation

**Status:** Complete - Research-Backed Architecture
**Last Updated:** 2025-12-06

---

## Overview

This document defines the observability architecture for FaceLink, linking performance requirements from Primary docs to specific technology choices and integration patterns.

**System Scope:**
- **Web Apps**: React dashboard (photographers) + React participant app
- **Desktop App**: Wails-based photo upload client
- **Backend**: Cloudflare Workers API + Cloudflare Queues + AWS Rekognition
- **Storage**: R2 object storage + D1 database
- **Real-time**: Durable Objects WebSocket connections

---

## Primary Requirements from Primary Docs

From `00_flows.md` and `00_business_rules.md`, these are the critical observability requirements:

| Flow | Performance Target | Business Impact |
|------|-------------------|-----------------|
| Photo Upload (request) | < 2s API response | Photographer experience, upload abandonment |
| Photo Processing | < 10s total | Time-to-search for participants |
| Face Search | < 3s total | Participant experience, search satisfaction |
| Photo Download | < 200ms API response | Delivery speed, user satisfaction |

**Supporting Integration:** See `02_auth.md` for authentication patterns that correlate with observability events.

---

## Critical Decision 1: Full-Stack Observability Architecture

### Backend: Cloudflare Workers → Grafana Cloud

**Technology Choice:** Native Cloudflare Workers OTLP export to Grafana Cloud

**Key Configuration:**
- **Traces**: 10% sampling, exported to Grafana Cloud
- **Logs**: 100% export for debugging capabilities
- **Coverage**: Workers, D1 database, R2 storage, Queue operations
- **Cost**: Free until January 2026, then $0.05 per million events

**Setup Requirements:**
- Grafana Cloud OTLP connection (uses standard OpenTelemetry endpoint)
- Cloudflare Workers observability destinations configured
- Automatic instrumentation for all Cloudflare services

**Implementation Source:** Cloudflare Workers OTLP Documentation

### Frontend: Sentry SDK for React Apps

**Technology Choice:** Sentry for error tracking, performance monitoring, and session replay

**Privacy-First Configuration:**
- **Session Replay**: Error-only (10% sampling), blocks all media
- **Media Blocking**: All face photos, images, and sensitive content blocked
- **Data Collection**: No PII by default, minimal trace data
- **Sampling**: 10% for performance traces

**Key Features:**
- Automatic error boundary detection
- Core Web Vitals monitoring (LCP, INP, CLS, TTFB)
- Route change tracking
- Custom performance spans for upload/search operations
- User feedback collection on errors

**Cost:** Sentry Team plan ($26/month) for full JavaScript SDK features

**Implementation Source:** Sentry React Documentation

---

## Critical Decision 2: Custom Business Metrics with Analytics Engine

**Technology Choice:** Cloudflare Analytics Engine for SQL-queryable, high-cardinality business metrics

**Key Benefits:**
- Real-time SQL queries on operational data
- High-cardinality dimensions (user IDs, event IDs)
- Built-in sampling and cost controls
- Grafana integration for dashboards

**Dataset Design:**
- **Photo Metrics**: Upload performance, processing times, format analysis
- **Search Metrics**: Search success rates, result counts, performance by event
- **Business KPIs**: Photos processed, searches performed, delivery rates

**Indexing Strategy:**
- Photo metrics indexed by photographer_id for per-customer analytics
- Search metrics indexed by event_id for per-event performance
- Cost-effective sampling for high-volume operations

**Key Metrics Tracked:**
- Upload volume by format, source, photographer
- Processing success rates and performance percentiles
- Search effectiveness and user behavior patterns
- Geographic distribution of uploads and searches

**Cost Model:** Free tier (100k events/day) + usage-based pricing at $0.25/million additional events

**Implementation Source:** Cloudflare Analytics Engine Documentation

---

## Critical Decision 3: End-to-End Distributed Tracing

**Technology Choice:** W3C Trace Context for cross-service correlation

**Trace Flow:**
Client → Cloudflare Workers → Cloudflare Queues → AWS Rekognition → Database

**Implementation Pattern:**
- Client generates trace ID with `traceparent` header format
- Each service extracts and forwards trace context
- Queue messages include trace context for async operations
- All logs include trace ID for correlation

**Header Format:** `traceparent: 00-{trace_id}-{span_id}-{flags}`
- Version: Always "00" (current standard)
- Trace ID: 32-character hex string
- Span ID: 16-character hex string
- Flags: "01" = sampled, "00" = not sampled

**Correlation Points:**
- Upload requests: Client → API → Queue → Processing
- Search operations: Web app → API → Rekognition → Response
- Error tracking: All errors include trace context
- Performance analysis: End-to-end latency measurement

**Privacy Considerations:**
- Trace IDs contain no user data
- Sampling decisions made at client level
- No sensitive data in trace context

**Implementation Source:** W3C Trace Context Specification

---

## Critical Decision 4: Desktop App Observability (Wails)

**Technology Choice:** Go structured logging with Grafana Loki integration

**Logging Architecture:**
- **Backend**: Go with Zap logger for high-performance structured logging
- **Format**: JSON logs with correlation fields (trace_id, user_id, event_type)
- **Storage**: Local file rotation + forward to Grafana Loki
- **Integration**: Correlates with web app traces via trace context

**Key Monitoring Areas:**
- **Upload Operations**: Start, progress, completion, failures with timing
- **File System Events**: Photo detection, validation, processing queues
- **System Metrics**: CPU, memory, disk usage, network performance
- **User Actions**: Configuration changes, session management

**Log Forwarding:**
- Grafana Loki endpoint for centralized log aggregation
- HTTP-based log shipping with authentication
- Offline buffering for network connectivity issues
- Batch processing to optimize performance

**Trace Correlation:**
- Desktop app generates or inherits trace context
- Correlates with web app traces for end-to-end visibility
- Logs include trace_id for cross-platform analysis

**Privacy Considerations:**
- No photo content or image data in logs
- File paths may contain sensitive directory information
- User data scrubbed before transmission

**Implementation Source:** Go Uber Zap Logger, Wails Documentation

---

## Critical Decision 5: Error Tracking and Privacy Protection

**Privacy-First Approach:** Zero tolerance for face photo capture in monitoring systems

**Sentry Privacy Configuration:**
- **Media Blocking**: All images, videos, face photos completely blocked
- **Text Masking**: All user input and display text masked
- **Session Replay**: Error-only recording, minimal sampling
- **Data Collection**: No PII, no user identifiers in basic tracking

**App-Specific Settings:**
- **Dashboard**: 10% performance sampling, 5% error replay
- **Participant**: 5% performance sampling, 2% error replay (more private)
- **Desktop**: Local logging only, no Sentry integration

**Error Boundary Strategy:**
- Feature-specific error boundaries with context
- User-friendly fallbacks with retry options
- Rich debugging context without sensitive data
- User feedback collection for critical errors

**Data Filtering Rules:**
- Block any error containing "face", "photo", "image" URLs
- Scrub file paths and directory structures
- Remove AWS/R2 storage URLs from error reports
- Hash user IDs for correlation without identification

**Compliance Considerations:**
- PDPA compliance for Thai market
- No biometric data in error tracking
- Minimal data retention periods
- User consent for any data collection

**Implementation Source:** Sentry Privacy Documentation, React Error Patterns

---

## Critical Decision 6: Performance Monitoring and Alerting

**Core Web Vitals Tracking:**
- **LCP (Largest Contentful Paint)**: < 2.5s target
- **INP (Interaction to Next Paint)**: < 200ms target
- **CLS (Cumulative Layout Shift)**: < 0.1 target
- **TTFB (Time to First Byte)**: < 800ms target

**Custom Performance Metrics:**
- **Upload Operations**: File count, total size, processing time
- **Search Operations**: Query complexity, result count, Rekognition latency
- **Database Operations**: Query performance, connection pooling
- **Queue Processing**: Queue depth, processing latency, error rates

**Alerting Strategy:**
- **Critical**: Error rate spikes, service downtime, processing failures
- **Warning**: Performance degradation, high latency, approaching limits
- **Info**: Business metric thresholds, usage patterns

**Dashboard Requirements:**
- System health overview (error rates, latency, throughput)
- Business metrics dashboards (uploads, searches, users)
- Performance analysis (response times, processing pipelines)
- Cost monitoring (observability spend vs. value)

**Notification Channels:**
- Critical alerts: Pager/email for immediate response
- Warning alerts: Slack/email for team awareness
- Business alerts: Daily/weekly reports for stakeholders

---

## Critical Decision 7: Cost Management and Optimization

**Cost Structure:**
- **Cloudflare OTLP**: Free until Jan 2026, then $0.05/million events
- **Sentry**: Team plan $26/month (5k errors, 50 session replays)
- **Analytics Engine**: 100k events/day free, $0.25/million additional
- **Grafana Cloud**: Included with other services

**Sampling Strategy:**
- **Production**: 10% traces, 100% logs, 5-10% session replay
- **Development**: 100% sampling for debugging
- **High-cost operations**: Lower sampling, event filtering
- **Critical paths**: Higher sampling for reliability

**Cost Optimization:**
- **Smart Sampling**: Critical operations always sampled
- **Event Filtering**: Exclude noise, focus on business value
- **Retention Policies**: Shorter retention for debug logs
- **Usage Monitoring**: Real-time cost dashboards

**Budget Planning:**
- **Phase 1**: Free tiers during development
- **Phase 2**: $50-100/month for full observability
- **Scale**: Usage-based growth with optimization

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Cloudflare Workers OTLP setup and Grafana Cloud destinations
- Sentry SDK integration with privacy-first configuration
- Error boundary implementation

### Phase 2: Business Metrics (Week 3-4)
- Analytics Engine datasets for photo/search metrics
- W3C trace context implementation
- Distributed tracing across services

### Phase 3: Desktop Integration (Week 5-6)
- Wails structured logging with Zap
- Grafana Loki integration for desktop logs
- Cross-platform trace correlation

---

## References

| Component | Documentation | Link |
|-----------|---------------|------|
| Cloudflare OTLP | Official docs | https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/ |
| Grafana Cloud | Setup guide | https://grafana.com/docs/grafana-cloud/ |
| Sentry React | JavaScript SDK | https://docs.sentry.io/platforms/javascript/guides/react/ |
| Analytics Engine | SQL queries | https://developers.cloudflare.com/analytics/analytics-engine/ |
| W3C Trace Context | Specification | https://w3c.github.io/trace-context/ |
| Go Zap Logger | High-performance logging | https://github.com/uber-go/zap |
| Wails Desktop | Framework docs | https://v2.wails.io/ |

**Connected Primary Docs:**
- `00_flows.md` - Performance targets for critical operations
- `00_business_rules.md` - Error handling and validation requirements
- `00_use_cases.md` - User journey tracking needs
- `01_data_schema.md` - Business metrics from database operations
- `02_auth.md` - User identification for observability correlation