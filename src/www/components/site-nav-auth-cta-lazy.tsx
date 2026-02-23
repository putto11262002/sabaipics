'use client';

import { Suspense, lazy } from 'react';

import { RoundedButton } from '@/components/ui/rounded-button';

const dashboardBaseUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://app.framefast.io');
const SIGN_IN_URL = `${dashboardBaseUrl}/sign-in`;

// Static fallback - renders immediately, no JS
function AuthCtaFallback() {
  return (
    <RoundedButton asChild variant="outline" size="sm" className="h-8 px-4 text-sm border-border/85 bg-background text-muted-foreground hover:bg-background hover:text-foreground">
      <a href={SIGN_IN_URL}>Sign in</a>
    </RoundedButton>
  );
}

// Lazy load the Clerk-aware component
const SiteNavAuthCtaWithClerk = lazy(() =>
  import('./site-nav-auth-cta-clerk').then((mod) => ({ default: mod.SiteNavAuthCtaClerk }))
);

export function SiteNavAuthCtaLazy() {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!hasClerkKey) {
    return <AuthCtaFallback />;
  }

  return (
    <Suspense fallback={<AuthCtaFallback />}>
      <SiteNavAuthCtaWithClerk />
    </Suspense>
  );
}
