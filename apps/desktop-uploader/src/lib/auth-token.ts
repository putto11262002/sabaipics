const TOKEN_KEY = 'framefast.desktop.refresh_token';

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

export async function getStoredRefreshToken(): Promise<string | null> {
  if (isTauri()) {
    try {
      const token = await tauriInvoke<string | null>('get_auth_token');
      return token ?? null;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function setStoredRefreshToken(token: string | null): Promise<void> {
  if (isTauri()) {
    if (!token) {
      await tauriInvoke('clear_auth_token');
      return;
    }
    await tauriInvoke('set_auth_token', { token });
    return;
  }

  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}
