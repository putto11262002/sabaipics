import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { emitStructuredLog } from '../lib/observability/log';
import {
  emitCounterMetric,
  emitHistogramMetricMs,
} from '../lib/observability/metrics';
import { TraceSpan } from '../lib/observability/trace';
import { runWithTraceSpan } from '../lib/observability/trace-context';

/**
 * Request logging middleware.
 * Logs method, path, status, duration, and userId for every request.
 * Place early in the middleware chain (after DB injection, before routes).
 */
export function requestLogger(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const start = Date.now();
    const requestId = c.req.header('x-request-id')?.trim() || crypto.randomUUID();
    const incomingTraceparent = c.req.header('traceparent')?.trim() || null;
    const incomingBaggage = c.req.header('baggage')?.trim();
    const path = new URL(c.req.url).pathname;
    const requestSpan = new TraceSpan(c.env, 'http.request', {
      parentTraceparent: incomingTraceparent,
      baggage: incomingBaggage,
      ctx: c.executionCtx as unknown as ExecutionContext,
      attributes: {
        'http.method': c.req.method,
        'http.route': path,
      },
    });
    const currentTraceparent = requestSpan.traceparent();

    c.set('requestId', requestId);
    c.set('traceparent', currentTraceparent);
    c.header('x-request-id', requestId);
    c.header('traceparent', currentTraceparent);

    let thrownError: unknown = null;
    try {
      await runWithTraceSpan(requestSpan, async () => {
        await next();
      });
    } catch (error) {
      thrownError = error;
      throw error;
    } finally {
      const durationMs = Date.now() - start;
      const status = c.res.status;
      const statusCode = thrownError || status >= 500 || requestSpan.isMarkedError() ? 'error' : 'ok';
      const statusClass = `${Math.floor(status / 100)}xx`;
      requestSpan.end(statusCode, {
        attributes: {
          'http.status_code': status,
          'request.duration_ms': durationMs,
        },
        statusMessage: thrownError ? 'request_failed' : undefined,
      });

      let userId: string | null = null;
      try {
        userId = c.get('auth')?.userId ?? null;
      } catch {
        // auth variable not registered for this route
      }

      const log = {
        request_id: requestId,
        traceparent: currentTraceparent,
        parent_traceparent: incomingTraceparent,
        trace_id: requestSpan.traceId,
        span_id: requestSpan.spanId,
        method: c.req.method,
        path,
        status,
        duration_ms: durationMs,
        user_id: userId,
        cf_ray: c.req.header('cf-ray') ?? null,
      };

      if (thrownError) {
        const errorMessage = thrownError instanceof Error ? thrownError.message : String(thrownError);
        emitStructuredLog(c, 'error', 'request_failed', { ...log, error: errorMessage });
      } else {
        emitStructuredLog(c, 'info', 'request_completed', log);
      }

      const metricAttrs = {
        status_class: statusClass,
      };
      emitCounterMetric(c.env, c.executionCtx as unknown as ExecutionContext, 'framefast_api_requests_total', 1, metricAttrs);
      emitHistogramMetricMs(
        c.env,
        c.executionCtx as unknown as ExecutionContext,
        'framefast_api_request_duration_ms',
        durationMs,
        metricAttrs,
      );

      if (!thrownError && status >= 500) {
        emitCounterMetric(
          c.env,
          c.executionCtx as unknown as ExecutionContext,
          'framefast_api_errors_total',
          1,
          {
            status_class: statusClass,
            error_class: '5xx',
          },
        );
      }
    }
  };
}
