import type { Context } from 'hono';
import { getCurrentTraceSpan } from './trace-context';

type LogLevel = 'info' | 'warn' | 'error';

type LogBody = Record<string, unknown> & {
  event: string;
  level: LogLevel;
};

function logToConsole(level: LogLevel, body: LogBody): void {
  const line = JSON.stringify(body);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function pushToLoki(c: Context<any, any, any>, body: LogBody): void {
  const lokiUrl = c.env.GRAFANA_LOKI_URL?.trim();
  const lokiUser = c.env.LOKI_USER?.trim();
  const lokiToken = c.env.LOKI_TOKEN?.trim();
  if (!lokiUrl || !lokiUser || !lokiToken) return;

  const pushUrl = `${lokiUrl.replace(/\/+$/, '')}/loki/api/v1/push`;
  const nsTimestamp = `${Date.now()}000000`;
  const labels: Record<string, string> = {
    service: 'framefast-api',
    env: c.env.NODE_ENV,
    event: String(body.event),
    level: String(body.level),
  };
  const sourceService = body.source_service;
  if (typeof sourceService === 'string' && sourceService.length > 0) {
    labels.source_service = sourceService.slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  const payload = {
    streams: [
      {
        stream: labels,
        values: [[nsTimestamp, JSON.stringify(body)]],
      },
    ],
  };

  c.executionCtx.waitUntil(
    fetch(pushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${lokiUser}:${lokiToken}`)}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (response.ok) return;
        const rejectedBody = await response.text().catch(() => '');
        console.warn(
          `[observability] Loki push rejected: status=${response.status} body=${rejectedBody}`,
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[observability] Loki push failed: ${message}`);
      }),
  );
}

export function emitStructuredLog(
  c: Context<any, any, any>,
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): void {
  const activeSpan = getCurrentTraceSpan();
  const body: LogBody = {
    event,
    level,
    timestamp: new Date().toISOString(),
    ...(activeSpan
      ? {
          trace_id: fields.trace_id ?? activeSpan.traceId,
          span_id: fields.span_id ?? activeSpan.spanId,
          traceparent: fields.traceparent ?? activeSpan.traceparent(),
        }
      : {}),
    ...fields,
  };
  logToConsole(level, body);
  pushToLoki(c, body);
}
