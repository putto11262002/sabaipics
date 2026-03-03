import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceHeaders, TraceSpan } from './trace';

type TraceContext = {
  span: TraceSpan;
};

const traceContextStorage = new AsyncLocalStorage<TraceContext>();

export function runWithTraceSpan<T>(span: TraceSpan, fn: () => Promise<T>): Promise<T> {
  return traceContextStorage.run({ span }, fn);
}

export function getCurrentTraceSpan(): TraceSpan | null {
  return traceContextStorage.getStore()?.span ?? null;
}

export function getCurrentTraceHeaders(): TraceHeaders | null {
  const span = getCurrentTraceSpan();
  return span ? span.propagationHeaders() : null;
}
