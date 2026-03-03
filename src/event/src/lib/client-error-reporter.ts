import { tracingFetch } from './tracing-fetch';

type ClientErrorSeverity = 'error' | 'fatal';

type ClientErrorPayload = {
  platform: 'web';
  sourceService?: 'framefast-event';
  errorType: string;
  message: string;
  stack?: string;
  handled?: boolean;
  severity?: ClientErrorSeverity;
  url?: string;
  route?: string;
  release?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
};

const MAX_MESSAGE = 2000;
const MAX_STACK = 16000;
const MAX_URL = 2048;
const MAX_ROUTE = 512;
let handlersInstalled = false;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function parseErrorLike(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name || 'Unknown error',
      stack: reason.stack,
    };
  }
  if (typeof reason === 'string') {
    return { message: reason };
  }
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

export async function reportClientError(payload: ClientErrorPayload): Promise<void> {
  const safePayload = {
    ...payload,
    sourceService: 'framefast-event' as const,
    message: truncate(payload.message || 'Unknown error', MAX_MESSAGE),
    stack: payload.stack ? truncate(payload.stack, MAX_STACK) : undefined,
    url: payload.url ? truncate(payload.url, MAX_URL) : undefined,
    route: payload.route ? truncate(payload.route, MAX_ROUTE) : undefined,
    severity: payload.severity ?? 'error',
    handled: payload.handled ?? false,
    release: import.meta.env.MODE,
    userAgent: navigator.userAgent,
  };

  try {
    await tracingFetch(`${import.meta.env.VITE_API_URL}/observability/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(safePayload),
    });
  } catch {
    // Never throw from error reporter path.
  }
}

export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    const details = parseErrorLike(event.error ?? event.message);
    void reportClientError({
      platform: 'web',
      sourceService: 'framefast-event',
      errorType: 'window_error',
      message: details.message,
      stack: details.stack,
      handled: false,
      severity: 'error',
      url: window.location.href,
      route: window.location.pathname,
      metadata: {
        lineno: event.lineno || 0,
        colno: event.colno || 0,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const details = parseErrorLike(event.reason);
    void reportClientError({
      platform: 'web',
      sourceService: 'framefast-event',
      errorType: 'unhandled_rejection',
      message: details.message,
      stack: details.stack,
      handled: false,
      severity: 'error',
      url: window.location.href,
      route: window.location.pathname,
    });
  });
}
