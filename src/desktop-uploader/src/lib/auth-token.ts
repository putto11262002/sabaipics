function isTauri() {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>) {
  const tauri = (window as { __TAURI__?: any }).__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error('Tauri invoke not available');
  }
  return tauri.core.invoke(command, args) as Promise<T>;
}

export type AuthStatus = {
  signedIn: boolean;
  user?: { name: string | null; email: string | null } | null;
};

/** Initialize the Rust token manager with the API base URL. Restores session if possible. */
export async function initTokenManager(baseUrl: string): Promise<AuthStatus> {
  return tauriInvoke<AuthStatus>('init_token_manager', { baseUrl });
}

/** Store tokens in Rust after OAuth redeem. */
export async function setAuthTokens(params: {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  userName?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  await tauriInvoke('set_auth_tokens', {
    accessToken: params.accessToken,
    expiresAt: params.expiresAt,
    refreshToken: params.refreshToken,
    userName: params.userName ?? null,
    userEmail: params.userEmail ?? null,
  });
}

/** Get a valid access token from Rust (auto-refreshes if expired). */
export async function getAccessToken(): Promise<string> {
  return tauriInvoke<string>('get_access_token');
}

/** Get current auth status. */
export async function getAuthStatus(): Promise<AuthStatus> {
  return tauriInvoke<AuthStatus>('get_auth_status');
}

/** Sign out — clears all tokens. */
export async function signOutRust(): Promise<void> {
  await tauriInvoke('sign_out');
}

/** Check if running in Tauri. */
export { isTauri };
