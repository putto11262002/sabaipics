'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '../../../auth/provider';

type WwwAuthProviderProps = {
  children: ReactNode;
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function WwwAuthProvider({ children }: WwwAuthProviderProps) {
  if (!clerkPublishableKey) {
    return <>{children}</>;
  }

  return <AuthProvider publishableKey={clerkPublishableKey}>{children}</AuthProvider>;
}

