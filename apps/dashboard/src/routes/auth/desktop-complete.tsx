import { useMemo } from 'react';
import { SignedIn, SignedOut, SignIn } from '@sabaipics/auth/react';

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get('code') ?? '',
    redirectUrl: params.get('redirect_url') ?? params.get('redirect') ?? '',
  };
}

function isAllowedRedirect(url: URL) {
  const isLocalhost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  return isHttp && isLocalhost && url.pathname === '/callback';
}

function buildLoopbackUrl(redirectUrl: string, code: string) {
  const url = new URL(redirectUrl);
  if (!isAllowedRedirect(url)) {
    throw new Error('Invalid redirect_url');
  }
  url.searchParams.set('code', code);
  return url.toString();
}

function buildDeepLinkUrl(code: string) {
  const url = new URL('framefast://auth');
  url.searchParams.set('code', code);
  return url.toString();
}

export function DesktopAuthCompletePage() {
  const { code, redirectUrl } = useMemo(getParams, []);

  const deepLinkUrl = useMemo(() => {
    if (!code) return '';
    return buildDeepLinkUrl(code);
  }, [code]);

  const { loopbackUrl, loopbackError } = useMemo(() => {
    if (!code || !redirectUrl) return { loopbackUrl: '', loopbackError: null as string | null };
    try {
      return { loopbackUrl: buildLoopbackUrl(redirectUrl, code), loopbackError: null };
    } catch (e) {
      return {
        loopbackUrl: '',
        loopbackError: e instanceof Error ? e.message : 'Invalid redirect_url',
      };
    }
  }, [code, redirectUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-6 py-10">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold">Open FrameFast</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You are signed in. Open the desktop app to finish setup.
          </p>

          {loopbackError ? <p className="mt-3 text-sm text-destructive">{loopbackError}</p> : null}
          {!code ? (
            <p className="mt-3 text-sm text-destructive">Missing code</p>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-2">
                <a
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  href={deepLinkUrl}
                >
                  Open FrameFast
                </a>

                {loopbackUrl ? (
                  <a
                    className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm"
                    href={loopbackUrl}
                  >
                    Use localhost callback
                  </a>
                ) : null}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                If your browser blocks opening the app automatically, click “Open FrameFast” again.
              </p>
            </>
          )}
        </div>

        <div className="mt-6">
          <SignedOut>
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">
                Session expired. Please sign in again.
              </p>
              <div className="mt-4">
                <SignIn routing="path" path="/auth/desktop" afterSignInUrl={window.location.href} />
              </div>
            </div>
          </SignedOut>
          <SignedIn>{null}</SignedIn>
        </div>
      </div>
    </div>
  );
}
