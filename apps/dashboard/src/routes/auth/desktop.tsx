import { useEffect, useMemo, useState } from "react";
import { SignIn, SignedIn, SignedOut, useAuth } from "@sabaipics/auth/react";

function getRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("redirect_url") ?? params.get("redirect") ?? "";
}

function buildReturnUrl(redirectUrl: string, token: string) {
  const url = new URL(redirectUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function DesktopAuthPage() {
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const redirectUrl = useMemo(getRedirectUrl, []);

  useEffect(() => {
    if (!redirectUrl) {
      setError("Missing redirect_url");
    }
  }, [redirectUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignedOut>
        <SignIn routing="path" path="/auth/desktop" afterSignInUrl={window.location.href} />
      </SignedOut>
      <SignedIn>
        <DesktopAuthRedirect
          redirectUrl={redirectUrl}
          getToken={getToken}
          error={error}
          onError={setError}
        />
      </SignedIn>
    </div>
  );
}

function DesktopAuthRedirect({
  redirectUrl,
  getToken,
  error,
  onError,
}: {
  redirectUrl: string;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  error: string | null;
  onError: (value: string | null) => void;
}) {
  useEffect(() => {
    const run = async () => {
      if (!redirectUrl) return;
      try {
        const token = await getToken();
        if (!token) {
          onError("Failed to obtain session token");
          return;
        }
        window.location.href = buildReturnUrl(redirectUrl, token);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to redirect");
      }
    };

    void run();
  }, [redirectUrl, getToken, onError]);

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  return <p className="text-muted-foreground text-sm">Completing sign in...</p>;
}
