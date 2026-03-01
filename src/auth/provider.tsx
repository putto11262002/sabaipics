import { ClerkProvider } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

export interface AuthProviderProps {
  children: ReactNode;
  publishableKey: string;
}

/**
 * AuthProvider - Wrapper around ClerkProvider
 *
 * This abstraction allows us to:
 * - Add future customization (analytics, error boundaries, logging)
 * - Swap auth providers without changing consuming code
 * - Control the auth provider interface
 */
export function AuthProvider({ children, publishableKey }: AuthProviderProps) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      {children}
    </ClerkProvider>
  );
}
