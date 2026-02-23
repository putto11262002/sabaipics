'use client';

import { ClerkProvider } from '@clerk/clerk-react';

import { RoundedButton } from '@/components/ui/rounded-button';
import { useAuth } from '../../auth/hooks';

const dashboardBaseUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://app.framefast.io');
const SIGN_IN_URL = `${dashboardBaseUrl}/sign-in`;
const DASHBOARD_URL = `${dashboardBaseUrl}/dashboard`;

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type CtaVariant = 'outline' | 'secondary';

const baseCtaClassName = 'h-8 px-4 text-sm';
const ctaClassNameByVariant: Record<CtaVariant, string> = {
  outline: 'border-border/85 bg-background text-muted-foreground hover:bg-background hover:text-foreground',
  secondary: 'border-transparent bg-muted text-foreground hover:bg-muted/90',
};

function CtaLink({
  href,
  label,
  variant = 'outline',
}: {
  href: string;
  label: string;
  variant?: CtaVariant;
}) {
  return (
    <RoundedButton
      asChild
      variant={variant}
      size="sm"
      className={`${baseCtaClassName} ${ctaClassNameByVariant[variant]}`}
    >
      <a href={href}>{label}</a>
    </RoundedButton>
  );
}

function AuthCtaContent() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <CtaLink href={SIGN_IN_URL} label="Sign in" />;
  }

  if (isSignedIn) {
    return <CtaLink href={DASHBOARD_URL} label="Dashboard" variant="secondary" />;
  }

  return <CtaLink href={SIGN_IN_URL} label="Sign in" />;
}

// This component wraps ClerkProvider - it's lazy loaded so Clerk JS only loads when needed
export function SiteNavAuthCtaClerk() {
  if (!clerkPublishableKey) {
    return <CtaLink href={SIGN_IN_URL} label="Sign in" />;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <AuthCtaContent />
    </ClerkProvider>
  );
}
