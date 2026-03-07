import React from 'react';
import { start, cancel, onUrl, onInvalidUrl } from '@fabianlars/tauri-plugin-oauth';
import { open } from '@tauri-apps/plugin-shell';
import {
  initTokenManager,
  setAuthTokens,
  getAccessToken as getAccessTokenRust,
  signOutRust,
} from '../lib/auth-token';

type AuthStatus = 'signed_out' | 'signing_in' | 'signed_in' | 'error';

type UserInfo = {
  name: string | null;
  email: string | null;
};

type AuthState = {
  status: AuthStatus;
  error?: string;
  user?: UserInfo | null;
};

type AuthContextValue = AuthState & {
  startAuth: () => Promise<void>;
  signOut: () => void;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const API_URL = import.meta.env.VITE_API_URL as string;

async function redeemDesktopAuthCode(params: { code: string; deviceName?: string }) {
  const res = await fetch(`${API_URL}/desktop/auth/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    user?: { name: string | null; email: string | null };
  };
}

function isValidCallbackUrl(url: URL, port: number) {
  return (
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    url.port === String(port) &&
    url.pathname === '/callback'
  );
}

function buildAuthUrl(redirectUrl: string) {
  const baseUrl = import.meta.env.VITE_AUTH_URL as string;
  if (!baseUrl) throw new Error('VITE_AUTH_URL is not set');

  const redirectParam = (import.meta.env.VITE_AUTH_REDIRECT_PARAM as string) || 'redirect_url';
  const url = new URL(baseUrl);
  if (redirectParam) url.searchParams.set(redirectParam, redirectUrl);
  url.searchParams.set('flow', 'code');

  return url.toString();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({ status: 'signing_in' });
  const portRef = React.useRef<number | null>(null);

  // Initialize Rust token manager and restore session
  React.useEffect(() => {
    const init = async () => {
      try {
        const result = await initTokenManager(API_URL);
        if (result.signedIn) {
          setState({
            status: 'signed_in',
            user: result.user ?? null,
          });
        } else {
          setState({ status: 'signed_out' });
        }
      } catch {
        setState({ status: 'signed_out' });
      }
    };
    void init();
  }, []);

  // Listen for OAuth callback
  React.useEffect(() => {
    const setup = async () => {
      const unlistenUrl = await onUrl((url) => {
        if (!portRef.current) return;
        const parsed = new URL(url);

        if (!isValidCallbackUrl(parsed, portRef.current)) {
          setState({ status: 'error', error: 'Invalid callback URL received' });
          return;
        }

        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        const code = params.code || '';
        if (!code) {
          setState({ status: 'error', error: 'Missing code in callback URL' });
          return;
        }

        setState({ status: 'signing_in' });

        void redeemDesktopAuthCode({ code, deviceName: 'FrameFast Desktop' })
          .then(async (tokens) => {
            // Store all tokens in Rust
            await setAuthTokens({
              accessToken: tokens.accessToken,
              expiresAt: tokens.accessTokenExpiresAt,
              refreshToken: tokens.refreshToken,
              userName: tokens.user?.name,
              userEmail: tokens.user?.email,
            });

            setState({
              status: 'signed_in',
              user: tokens.user ?? null,
            });
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

  const getAccessToken = React.useCallback(async () => {
    if (state.status !== 'signed_in') return null;
    try {
      return await getAccessTokenRust();
    } catch {
      setState({ status: 'signed_out' });
      return null;
    }
  }, [state.status]);

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
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : `Failed to start auth: ${String(error)}`,
      });
    }
  }, []);

  const signOut = React.useCallback(() => {
    void signOutRust();
    setState({ status: 'signed_out' });
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
