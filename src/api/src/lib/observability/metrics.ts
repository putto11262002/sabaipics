type MetricsEnv = {
  NODE_ENV: string;
  GRAFANA_OTLP_METRICS_URL?: string;
  OTLP_METRICS_USER?: string;
  OTLP_METRICS_TOKEN?: string;
  GRAFANA_OTLP_TRACES_URL?: string;
  OTLP_TRACES_USER?: string;
  OTLP_TRACES_TOKEN?: string;
};

type MetricAttributes = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_HISTOGRAM_BOUNDS_MS = [10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000];
const OTEL_SCOPE = { name: 'framefast-observability', version: '1.0.0' };

function hasWaitUntil(
  ctx: ExecutionContext | undefined,
): ctx is ExecutionContext & { waitUntil: (promise: Promise<unknown>) => void } {
  return Boolean(ctx && typeof ctx.waitUntil === 'function');
}

function nowNanos(): string {
  return `${Date.now()}000000`;
}

function resolveOtlpMetricsUrl(raw: string): string {
  const normalized = raw.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/v1/metrics')) return normalized;
  if (normalized.endsWith('/otlp')) return `${normalized}/v1/metrics`;
  if (normalized.endsWith('/tempo')) return `${normalized.slice(0, -'/tempo'.length)}/otlp/v1/metrics`;
  return `${normalized}/v1/metrics`;
}

function toOtelAttributes(attributes?: MetricAttributes): Array<{
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

function getMetricsAuth(env: MetricsEnv): { endpoint: string; authHeader: string } | null {
  const endpointRaw = env.GRAFANA_OTLP_METRICS_URL?.trim() || env.GRAFANA_OTLP_TRACES_URL?.trim();
  const user = env.OTLP_METRICS_USER?.trim() || env.OTLP_TRACES_USER?.trim();
  const token = env.OTLP_METRICS_TOKEN?.trim() || env.OTLP_TRACES_TOKEN?.trim();
  if (!endpointRaw || !user || !token) return null;
  return {
    endpoint: resolveOtlpMetricsUrl(endpointRaw),
    authHeader: `Basic ${btoa(`${user}:${token}`)}`,
  };
}

function emitOtlpMetrics(
  env: MetricsEnv,
  ctx: ExecutionContext | undefined,
  payload: Record<string, unknown>,
): void {
  const auth = getMetricsAuth(env);
  if (!auth) return;

  const req = fetch(auth.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth.authHeader,
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      if (response.ok) return;
      const body = await response.text().catch(() => '');
      console.warn(`[metrics] OTLP push rejected: status=${response.status} body=${body}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[metrics] OTLP push failed: ${message}`);
    });

  if (hasWaitUntil(ctx)) {
    ctx.waitUntil(req);
  } else {
    void req;
  }
}

export function normalizeRouteGroup(path: string): string {
  const parts = path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(part) ||
        /^\d+$/.test(part) ||
        /^[0-9a-f]{16,}$/i.test(part)
      ) {
        return ':id';
      }
      return part;
    });
  return `/${parts.join('/')}`;
}

export function emitCounterMetric(
  env: MetricsEnv,
  ctx: ExecutionContext | undefined,
  name: string,
  value: number,
  attributes?: MetricAttributes,
): void {
  const ts = nowNanos();
  emitOtlpMetrics(env, ctx, {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'framefast-api' } },
            { key: 'deployment.environment', value: { stringValue: env.NODE_ENV } },
          ],
        },
        scopeMetrics: [
          {
            scope: OTEL_SCOPE,
            metrics: [
              {
                name,
                unit: '1',
                sum: {
                  aggregationTemporality: 2,
                  isMonotonic: true,
                  dataPoints: [
                    {
                      asInt: String(Math.max(0, Math.trunc(value))),
                      timeUnixNano: ts,
                      attributes: toOtelAttributes(attributes),
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });
}

export function emitHistogramMetricMs(
  env: MetricsEnv,
  ctx: ExecutionContext | undefined,
  name: string,
  valueMs: number,
  attributes?: MetricAttributes,
  explicitBounds: number[] = DEFAULT_HISTOGRAM_BOUNDS_MS,
): void {
  const bounds = [...explicitBounds].sort((a, b) => a - b);
  const bucketCounts = new Array(bounds.length + 1).fill('0');
  const idx = bounds.findIndex((bound) => valueMs <= bound);
  bucketCounts[idx >= 0 ? idx : bucketCounts.length - 1] = '1';
  const ts = nowNanos();

  emitOtlpMetrics(env, ctx, {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'framefast-api' } },
            { key: 'deployment.environment', value: { stringValue: env.NODE_ENV } },
          ],
        },
        scopeMetrics: [
          {
            scope: OTEL_SCOPE,
            metrics: [
              {
                name,
                unit: 'ms',
                histogram: {
                  aggregationTemporality: 2,
                  dataPoints: [
                    {
                      timeUnixNano: ts,
                      count: '1',
                      sum: Math.max(0, valueMs),
                      explicitBounds: bounds,
                      bucketCounts,
                      attributes: toOtelAttributes(attributes),
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });
}
