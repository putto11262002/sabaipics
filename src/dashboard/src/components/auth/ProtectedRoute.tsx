import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { useAuth, useUser } from '@/auth/react';
import { Navigate, useLocation } from 'react-router';
import { LogoMark } from '@/shared/components/icons/logo-mark';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const location = useLocation();
  const identified = useRef(false);

  useEffect(() => {
    if (isSignedIn && userId && user && !identified.current) {
      posthog.identify(userId, {
        email: user.emailAddresses[0]?.emailAddress,
        name: user.fullName,
      });
      identified.current = true;
    }
  }, [isSignedIn, userId, user]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <LogoMark className="size-20 animate-pulse" />
        <span className="text-lg font-semibold text-foreground">FrameFast</span>
      </div>
    );
  }

  if (!isSignedIn) {
    // Preserve complete URL including query params for Clerk redirect
    const currentUrl = `${location.pathname}${location.search}`;
    const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`;

    return <Navigate to={signInUrl} replace />;
  }

  return <>{children}</>;
}
