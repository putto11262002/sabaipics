type TraceEnv = {
  NODE_ENV: string;
  OTEL_TRACE_SAMPLE_RATIO?: string;
  GRAFANA_OTLP_TRACES_URL?: string;
  OTLP_TRACES_USER?: string;
  OTLP_TRACES_TOKEN?: string;
};

type SpanStatus = 'ok' | 'error';

export type TraceHeaders = {
  traceparent: string;
  baggage?: string;
};

type SpanAttributes = Record<string, string | number | boolean | null | undefined>;

const TRACE_VERSION = '00';
const TRACE_FLAGS = '01';
const TRACE_FLAGS_UNSAMPLED = '00';

function hasWaitUntil(
  ctx: ExecutionContext | undefined,
): ctx is ExecutionContext & { waitUntil: (promise: Promise<unknown>) => void } {
  return Boolean(ctx && typeof ctx.waitUntil === 'function');
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
}

function nowNanos(): string {
  return `${Date.now()}000000`;
}

function defaultSampleRatio(nodeEnv: string): number {
  if (nodeEnv === 'development') return 1;
  if (nodeEnv === 'staging') return 0.6;
  return 0.5;
}

function resolveSampleRatio(env: TraceEnv): number {
  const raw = env.OTEL_TRACE_SAMPLE_RATIO?.trim();
  if (!raw) return defaultSampleRatio(env.NODE_ENV);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultSampleRatio(env.NODE_ENV);
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function resolveOtlpTracesUrl(raw: string): string {
  const normalized = raw.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/v1/traces')) return normalized;
  if (normalized.endsWith('/otlp')) return `${normalized}/v1/traces`;
  if (normalized.endsWith('/tempo')) return `${normalized.slice(0, -'/tempo'.length)}/otlp/v1/traces`;
  return `${normalized}/v1/traces`;
}

function parseTraceparent(value?: string | null): {
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
} | null {
  if (!value) return null;
  const parts = value.trim().split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, parentSpanId, traceFlags] = parts;
  if (
    version.length !== 2 ||
    traceId.length !== 32 ||
    parentSpanId.length !== 16 ||
    traceFlags.length !== 2
  ) {
    return null;
  }
  return { traceId, parentSpanId, traceFlags };
}

function serializeTraceparent(traceId: string, spanId: string, traceFlags: string): string {
  return `${TRACE_VERSION}-${traceId}-${spanId}-${traceFlags}`;
}

function isSampledTraceFlags(traceFlags: string): boolean {
  const parsed = Number.parseInt(traceFlags, 16);
  if (Number.isNaN(parsed)) return false;
  return (parsed & 0x01) === 0x01;
}

function toOtelAttributes(attributes?: SpanAttributes): Array<{
  key: string;
  value: { stringValue?: string; intValue?: number; boolValue?: boolean };
}> {
  if (!attributes) return [];
  const out: Array<{
    key: string;
    value: { stringValue?: string; intValue?: number; boolValue?: boolean };
  }> = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      out.push({ key, value: { boolValue: value } });
      continue;
    }
    if (typeof value === 'number') {
      out.push({ key, value: { intValue: Math.trunc(value) } });
      continue;
    }
    out.push({ key, value: { stringValue: String(value) } });
  }
  return out;
}

export class TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly baggage?: string;
  private readonly env: TraceEnv;
  private readonly ctx?: ExecutionContext;
  private readonly name: string;
  private readonly startTimeUnixNano: string;
  private readonly baseAttributes?: SpanAttributes;
  private readonly traceFlags: string;
  private readonly sampled: boolean;
  private markedStatus: SpanStatus | null = null;
  private markedStatusMessage?: string;
  private markedAttributes?: SpanAttributes;

  constructor(
    env: TraceEnv,
    name: string,
    options?: {
      parentTraceparent?: string | null;
      baggage?: string;
      attributes?: SpanAttributes;
      ctx?: ExecutionContext;
    },
  ) {
    const parsed = parseTraceparent(options?.parentTraceparent ?? null);
    const rootSampled = Math.random() < resolveSampleRatio(env);
    const traceFlags = parsed?.traceFlags ?? (rootSampled ? TRACE_FLAGS : TRACE_FLAGS_UNSAMPLED);
    this.traceId = parsed?.traceId ?? randomHex(16);
    this.spanId = randomHex(8);
    this.parentSpanId = parsed?.parentSpanId;
    this.traceFlags = traceFlags;
    this.sampled = isSampledTraceFlags(traceFlags);
    this.baggage = options?.baggage;
    this.env = env;
    this.ctx = options?.ctx;
    this.name = name;
    this.startTimeUnixNano = nowNanos();
    this.baseAttributes = options?.attributes;
  }

  traceparent(): string {
    return serializeTraceparent(this.traceId, this.spanId, this.traceFlags);
  }

  propagationHeaders(): TraceHeaders {
    return this.baggage
      ? { traceparent: this.traceparent(), baggage: this.baggage }
      : { traceparent: this.traceparent() };
  }

  child(
    name: string,
    options?: { attributes?: SpanAttributes; baggage?: string; ctx?: ExecutionContext },
  ): TraceSpan {
    return new TraceSpan(this.env, name, {
      parentTraceparent: this.traceparent(),
      baggage: options?.baggage ?? this.baggage,
      attributes: options?.attributes,
      ctx: options?.ctx ?? this.ctx,
    });
  }

  markError(options?: { attributes?: SpanAttributes; statusMessage?: string }): void {
    this.markedStatus = 'error';
    if (!this.markedStatusMessage && options?.statusMessage) {
      this.markedStatusMessage = options.statusMessage;
    }
    if (options?.attributes) {
      this.markedAttributes = {
        ...(this.markedAttributes ?? {}),
        ...options.attributes,
      };
    }
  }

  isMarkedError(): boolean {
    return this.markedStatus === 'error';
  }

  end(status: SpanStatus, options?: { attributes?: SpanAttributes; statusMessage?: string }): void {
    if (!this.sampled) return;
    const tracesUrlRaw = this.env.GRAFANA_OTLP_TRACES_URL?.trim();
    const user = this.env.OTLP_TRACES_USER?.trim();
    const token = this.env.OTLP_TRACES_TOKEN?.trim();
    if (!tracesUrlRaw || !user || !token) return;
    const tracesUrl = resolveOtlpTracesUrl(tracesUrlRaw);

    const finalStatus = this.markedStatus ?? status;
    const finalStatusMessage = options?.statusMessage ?? this.markedStatusMessage;
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'framefast-api' } },
              { key: 'deployment.environment', value: { stringValue: this.env.NODE_ENV } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'framefast-observability', version: '1.0.0' },
              spans: [
                {
                  traceId: this.traceId,
                  spanId: this.spanId,
                  parentSpanId: this.parentSpanId,
                  name: this.name,
                  kind: 1,
                  startTimeUnixNano: this.startTimeUnixNano,
                  endTimeUnixNano: nowNanos(),
                  attributes: toOtelAttributes({
                    ...(this.baseAttributes ?? {}),
                    ...(this.markedAttributes ?? {}),
                    ...(options?.attributes ?? {}),
                  }),
                  status: {
                    code: finalStatus === 'ok' ? 1 : 2,
                    message: finalStatusMessage,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const req = fetch(tracesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${user}:${token}`)}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (response.ok) return;
        const body = await response.text().catch(() => '');
        console.warn(`[trace] OTLP push rejected: status=${response.status} body=${body}`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[trace] OTLP push failed: ${message}`);
      });

    if (hasWaitUntil(this.ctx)) {
      this.ctx.waitUntil(req);
    } else {
      void req;
    }
  }
}
