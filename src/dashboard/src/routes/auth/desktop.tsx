import { useCallback, useEffect, useMemo, useState } from 'react';
import { SignIn, SignedIn, SignedOut, useAuth } from '@/auth/react';
import { useDesktopAuthExchange } from '../../hooks/auth/useDesktopAuthExchange';

function getRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect_url') ?? params.get('redirect') ?? '';
}

function isAllowedRedirect(url: URL) {
  const isLocalhost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  return isHttp && isLocalhost && url.pathname === '/callback';
}

function buildReturnUrl(redirectUrl: string, code: string) {
  const url = new URL(redirectUrl);
  if (!isAllowedRedirect(url)) {
    throw new Error('Invalid redirect_url');
  }
  url.searchParams.set('code', code);
  return url.toString();
}

export function DesktopAuthPage() {
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const redirectUrl = useMemo(getRedirectUrl, []);

  useEffect(() => {
    if (!redirectUrl) {
      setError('Missing redirect_url');
      return;
    }
    try {
      const candidate = new URL(redirectUrl);
      if (!isAllowedRedirect(candidate)) {
        setError('Invalid redirect_url');
      }
    } catch {
      setError('Invalid redirect_url');
    }
  }, [redirectUrl]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((prev) => prev + 1);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignedOut>
        <SignIn routing="path" path="/auth/desktop" afterSignInUrl={window.location.href} />
      </SignedOut>
      <SignedIn>
        <DesktopAuthRedirect
          redirectUrl={redirectUrl}
          getToken={getToken}
          error={error}
          onError={setError}
          attempt={attempt}
          onRetry={retry}
        />
      </SignedIn>
    </div>
  );
}

function DesktopAuthRedirect({
  redirectUrl,
  getToken,
  error,
  onError,
  attempt,
  onRetry,
}: {
  redirectUrl: string;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  error: string | null;
  onError: (value: string | null) => void;
  attempt: number;
  onRetry: () => void;
}) {
  const exchange = useDesktopAuthExchange();

  useEffect(() => {
    const run = async () => {
      if (!redirectUrl) return;
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          onError('Failed to obtain session token');
          return;
        }

        const exchanged = await exchange.mutateAsync({
          clerkToken,
          deviceName: 'FrameFast Desktop',
        });
        const returnUrl = buildReturnUrl(redirectUrl, exchanged.code);
        window.location.href = returnUrl;
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to redirect');
      }
    };

    void run();
  }, [attempt, redirectUrl, getToken, onError, exchange]);

  if (error) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          type="button"
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => {
            exchange.reset();
            onRetry();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return <p className="text-muted-foreground text-sm">Completing sign in...</p>;
}
