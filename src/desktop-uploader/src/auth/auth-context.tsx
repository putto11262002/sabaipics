import React from 'react';
import { start, cancel, onUrl, onInvalidUrl } from '@fabianlars/tauri-plugin-oauth';
import { open } from '@tauri-apps/plugin-shell';
import { getStoredRefreshToken, setStoredRefreshToken } from '../lib/auth-token';

type AuthStatus = 'signed_out' | 'signing_in' | 'signed_in' | 'error';

type AuthState = {
  status: AuthStatus;
  callbackUrl?: string;
  params?: Record<string, string>;
  error?: string;
  accessToken?: string | null;
  accessTokenExpiresAt?: number | null;
};

type AuthContextValue = AuthState & {
  startAuth: () => Promise<void>;
  signOut: () => void;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function loadStoredAuth(): AuthState {
  return { status: 'signed_out' };
}

function storeAuth(state: AuthState) {
  if (state.status === 'signed_in') {
    void setStoredRefreshToken(state.params?.refreshToken ?? null);
    return;
  }
  if (state.status === 'signed_out') {
    void setStoredRefreshToken(null);
  }
}

function buildAuthUrl(redirectUrl: string) {
  const baseUrl = import.meta.env.VITE_AUTH_URL as string;
  if (!baseUrl) {
    throw new Error('VITE_AUTH_URL is not set');
  }

  const redirectParam = (import.meta.env.VITE_AUTH_REDIRECT_PARAM as string) || 'redirect_url';

  const url = new URL(baseUrl);
  if (redirectParam) {
    url.searchParams.set(redirectParam, redirectUrl);
  }

  // Signal dashboard bridge to use code flow.
  url.searchParams.set('flow', 'code');

  return url.toString();
}

function isValidCallbackUrl(url: URL, port: number) {
  return (
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    url.port === String(port) &&
    url.pathname === '/callback'
  );
}

async function redeemDesktopAuthCode(params: { code: string; deviceName?: string }): Promise<{
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/desktop/auth/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: params.code, deviceName: params.deviceName }),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as {
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
  };
}

async function refreshDesktopSession(params: { refreshToken: string }): Promise<{
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number;
  refreshTokenUnchanged?: boolean;
}> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/desktop/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: params.refreshToken }),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as {
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string | null;
    refreshTokenExpiresAt: number;
    refreshTokenUnchanged?: boolean;
  };
}

function shouldRefresh(expiresAt: number | null | undefined) {
  if (!expiresAt) return true;
  // Refresh 60s early.
  return Date.now() + 60_000 >= expiresAt;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(loadStoredAuth);
  const portRef = React.useRef<number | null>(null);
  const refreshTokenRef = React.useRef<string | null>(null);
  const refreshInFlightRef = React.useRef<Promise<string | null> | null>(null);

  React.useEffect(() => {
    const setup = async () => {
      const unlistenUrl = await onUrl((url) => {
        if (!portRef.current) return;
        const parsed = new URL(url);

        if (!isValidCallbackUrl(parsed, portRef.current)) {
          setState({
            status: 'error',
            error: 'Invalid callback URL received',
          });
          return;
        }

        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        const code = params.code || '';
        if (!code) {
          setState({
            status: 'error',
            error: 'Missing code in callback URL',
          });
          return;
        }

        setState({ status: 'signing_in' });

        void redeemDesktopAuthCode({ code, deviceName: 'FrameFast Desktop' })
          .then((tokens) => {
            refreshTokenRef.current = tokens.refreshToken;
            const nextState: AuthState = {
              status: 'signed_in',
              callbackUrl: parsed.toString(),
              params: { refreshToken: tokens.refreshToken },
              accessToken: tokens.accessToken,
              accessTokenExpiresAt: tokens.accessTokenExpiresAt,
            };
            setState(nextState);
            storeAuth(nextState);
          })
          .catch((err) => {
            setState({
              status: 'error',
              error: err instanceof Error ? err.message : 'Failed to redeem code',
            });
          })
          .finally(() => {
            if (portRef.current) {
              cancel(portRef.current);
              portRef.current = null;
            }
          });
      });

      const unlistenInvalid = await onInvalidUrl((url) => {
        setState({ status: 'error', error: `Invalid callback: ${url}` });
      });

      return () => {
        unlistenUrl();
        unlistenInvalid();
      };
    };

    const teardownPromise = setup();
    return () => {
      teardownPromise.then((teardown) => teardown?.());
    };
  }, []);

  React.useEffect(() => {
    const load = async () => {
      const refreshToken = await getStoredRefreshToken();
      if (!refreshToken) return;

      refreshTokenRef.current = refreshToken;
      setState({ status: 'signing_in' });

      try {
        const refreshed = await refreshDesktopSession({ refreshToken });
        if (refreshed.refreshToken) {
          refreshTokenRef.current = refreshed.refreshToken;
          await setStoredRefreshToken(refreshed.refreshToken);
        }

        setState({
          status: 'signed_in',
          params: { refreshToken: refreshTokenRef.current ?? refreshToken },
          accessToken: refreshed.accessToken,
          accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        });
      } catch {
        refreshTokenRef.current = null;
        await setStoredRefreshToken(null);
        setState({ status: 'signed_out' });
      }
    };
    void load();
  }, []);

  const getAccessToken = React.useCallback(async () => {
    if (state.status !== 'signed_in') return null;

    if (!shouldRefresh(state.accessTokenExpiresAt ?? null) && state.accessToken) {
      return state.accessToken;
    }

    const refreshToken = refreshTokenRef.current;
    if (!refreshToken) return null;

    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = (async () => {
        const refreshed = await refreshDesktopSession({ refreshToken });

        const nextRefreshToken = refreshed.refreshToken ?? refreshToken;
        refreshTokenRef.current = nextRefreshToken;
        if (refreshed.refreshToken) {
          await setStoredRefreshToken(refreshed.refreshToken);
        }

        setState((prev) => {
          if (prev.status !== 'signed_in') return prev;
          return {
            ...prev,
            params: { refreshToken: nextRefreshToken },
            accessToken: refreshed.accessToken,
            accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
          };
        });

        return refreshed.accessToken;
      })()
        .catch(async () => {
          refreshTokenRef.current = null;
          await setStoredRefreshToken(null);
          setState({ status: 'signed_out' });
          return null;
        })
        .finally(() => {
          refreshInFlightRef.current = null;
        });
    }

    return refreshInFlightRef.current;
  }, [state.accessToken, state.accessTokenExpiresAt, state.status]);

  const startAuth = React.useCallback(async () => {
    try {
      if (portRef.current) {
        cancel(portRef.current);
        portRef.current = null;
      }

      const port = await start();
      portRef.current = port;
      setState({ status: 'signing_in' });

      const redirectUrl = `http://127.0.0.1:${port}/callback`;
      const authUrl = buildAuthUrl(redirectUrl);

      await open(authUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Failed to start auth: ${String(error)}`;
      setState({
        status: 'error',
        error: errorMessage,
      });
    }
  }, []);

  const signOut = React.useCallback(() => {
    refreshTokenRef.current = null;
    const nextState: AuthState = { status: 'signed_out' };
    setState(nextState);
    storeAuth(nextState);
  }, []);

  const value: AuthContextValue = {
    ...state,
    startAuth,
    signOut,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
