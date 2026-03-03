import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { reportClientError } from '../../lib/client-error-reporter';

export default function RouteErrorFallback() {
  const error = useRouteError();
  const route = typeof window !== 'undefined' ? window.location.pathname : '';

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Route error';

  const stack = error instanceof Error ? error.stack : undefined;

  useEffect(() => {
    void reportClientError({
      platform: 'web',
      sourceService: 'framefast-event',
      errorType: 'route_error',
      message,
      stack,
      handled: true,
      severity: 'error',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      route,
    });
  }, [message, route, stack]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h1 className="text-2xl font-semibold">Page failed to load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We recorded this issue. Try reloading the page.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-foreground px-4 py-2 text-sm text-background"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
