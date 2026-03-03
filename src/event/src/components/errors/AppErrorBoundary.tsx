import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../../lib/client-error-reporter';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void reportClientError({
      platform: 'web',
      sourceService: 'framefast-event',
      errorType: 'react_error_boundary',
      message: error.message || 'React render error',
      stack: [error.stack, info.componentStack].filter(Boolean).join('\n'),
      handled: true,
      severity: 'error',
      url: window.location.href,
      route: window.location.pathname,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We recorded this issue. Please refresh and try again.
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

    return this.props.children;
  }
}
