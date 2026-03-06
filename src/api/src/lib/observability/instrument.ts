/**
 * Observability instrumentation combinator for neverthrow ResultAsync.
 *
 * Wraps business logic with automatic span creation, metrics emission,
 * and structured logging — keeping observability out of business logic files.
 *
 * Usage:
 *   const inst = createInstrument({ env, ctx, component: 'pipeline_consumer' });
 *   inst.traced('claim_intent', () => claimIntent(db, r2Key), { attributes: {...} })
 */

import { ResultAsync, type Result } from 'neverthrow';
import { TraceSpan } from './trace';
import { emitWorkerLog } from './worker-log';
import { emitCounterMetric, emitHistogramMetricMs } from './metrics';
import type { Bindings } from '../../types';

type SpanAttributes = Record<string, string | number | boolean | null | undefined>;

export interface InstrumentConfig {
  env: Bindings;
  ctx: ExecutionContext;
  component: string;
  parentTraceparent?: string | null;
  baggage?: string;
  baseAttributes?: SpanAttributes;
}

export interface Instrument {
  readonly rootSpan: TraceSpan;

  /**
   * Wrap a ResultAsync with automatic span + duration metric + error log.
   * On Ok: ends span ok, emits duration histogram with status=ok.
   * On Err: ends span error, emits duration histogram with status=error, emits structured error log.
   */
  traced<T, E>(
    step: string,
    fn: () => ResultAsync<T, E>,
    opts?: { attributes?: SpanAttributes },
  ): ResultAsync<T, E>;

  /**
   * Wrap a Promise with automatic span + duration metric + error log.
   * Converts thrown errors to a standard shape. For use with non-neverthrow code.
   */
  tracedPromise<T>(
    step: string,
    fn: () => Promise<T>,
    opts?: { attributes?: SpanAttributes },
  ): ResultAsync<T, TracedError>;

  /** Emit a counter metric under the component namespace. */
  count(metric: string, value?: number, attributes?: SpanAttributes): void;

  /** Emit a histogram metric under the component namespace. */
  histogram(metric: string, valueMs: number, attributes?: SpanAttributes): void;

  /** Emit a structured log. */
  log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void;

  /** Emit batch-level summary and close the root span. */
  complete(stats: { total: number; ok: number; failed: number }): void;
}

export interface TracedError {
  type: 'traced_error';
  step: string;
  cause: unknown;
  message: string;
}

export function createInstrument(config: InstrumentConfig): Instrument {
  const { env, ctx, component } = config;
  const prefix = `framefast_${component}`;

  const rootSpan = new TraceSpan(env, `${component}.batch`, {
    parentTraceparent: config.parentTraceparent ?? null,
    baggage: config.baggage,
    ctx,
    attributes: config.baseAttributes,
  });

  const baseLogFields = {
    area: 'pipeline',
    component,
  };

  return {
    rootSpan,

    traced<T, E>(
      step: string,
      fn: () => ResultAsync<T, E>,
      opts?: { attributes?: SpanAttributes },
    ): ResultAsync<T, E> {
      const span = rootSpan.child(`${component}.${step}`, {
        attributes: opts?.attributes,
      });
      const start = Date.now();

      return fn()
        .map((val) => {
          span.end('ok');
          emitHistogramMetricMs(env, ctx, `${prefix}_step_duration_ms`, Date.now() - start, {
            step,
            status: 'ok',
          });
          return val;
        })
        .mapErr((err) => {
          const errStr = err instanceof Error ? err.message : String(err);
          span.end('error', { statusMessage: errStr });
          emitHistogramMetricMs(env, ctx, `${prefix}_step_duration_ms`, Date.now() - start, {
            step,
            status: 'error',
          });
          emitWorkerLog(
            env,
            'error',
            `${component}_${step}_error`,
            {
              ...baseLogFields,
              step,
              error_message: errStr,
              trace_id: rootSpan.traceId,
              span_id: span.spanId,
            },
            ctx,
          );
          return err;
        });
    },

    tracedPromise<T>(
      step: string,
      fn: () => Promise<T>,
      opts?: { attributes?: SpanAttributes },
    ): ResultAsync<T, TracedError> {
      const span = rootSpan.child(`${component}.${step}`, {
        attributes: opts?.attributes,
      });
      const start = Date.now();

      return ResultAsync.fromPromise(fn(), (cause): TracedError => ({
        type: 'traced_error',
        step,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }))
        .map((val) => {
          span.end('ok');
          emitHistogramMetricMs(env, ctx, `${prefix}_step_duration_ms`, Date.now() - start, {
            step,
            status: 'ok',
          });
          return val;
        })
        .mapErr((err) => {
          span.end('error', { statusMessage: err.message });
          emitHistogramMetricMs(env, ctx, `${prefix}_step_duration_ms`, Date.now() - start, {
            step,
            status: 'error',
          });
          emitWorkerLog(
            env,
            'error',
            `${component}_${step}_error`,
            {
              ...baseLogFields,
              step,
              error_message: err.message,
              trace_id: rootSpan.traceId,
              span_id: span.spanId,
            },
            ctx,
          );
          return err;
        });
    },

    count(metric: string, value = 1, attributes?: SpanAttributes): void {
      emitCounterMetric(env, ctx, `${prefix}_${metric}`, value, attributes);
    },

    histogram(metric: string, valueMs: number, attributes?: SpanAttributes): void {
      emitHistogramMetricMs(env, ctx, `${prefix}_${metric}`, valueMs, attributes);
    },

    log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void {
      emitWorkerLog(
        env,
        level,
        `${component}_${event}`,
        {
          ...baseLogFields,
          ...fields,
          trace_id: rootSpan.traceId,
          span_id: rootSpan.spanId,
        },
        ctx,
      );
    },

    complete(stats: { total: number; ok: number; failed: number }): void {
      emitCounterMetric(env, ctx, `${prefix}_jobs_total`, stats.ok, { status: 'ok' });
      emitCounterMetric(env, ctx, `${prefix}_jobs_total`, stats.failed, { status: 'error' });
      emitHistogramMetricMs(env, ctx, `${prefix}_batch_size`, stats.total, {});
      emitWorkerLog(
        env,
        'info',
        `${component}_batch_complete`,
        {
          ...baseLogFields,
          batch_size: stats.total,
          ok_count: stats.ok,
          failed_count: stats.failed,
          trace_id: rootSpan.traceId,
        },
        ctx,
      );
      rootSpan.end(stats.failed > 0 ? 'error' : 'ok', {
        attributes: {
          'batch.total': stats.total,
          'batch.ok': stats.ok,
          'batch.failed': stats.failed,
        },
      });
    },
  };
}
