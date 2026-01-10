# UI Design Document: T-6 Signup UI + PDPA Consent Modal

**Task:** T-6 — Signup UI + PDPA consent modal
**Surface:** Dashboard UI (Frontend)
**Root:** `/docs/logs/BS_0001_S-1/`
**Date:** 2026-01-10

---

## 1. Component Hierarchy & User Flow

```
User Flow:
┌─────────────────────────────────────────────────────────────┐
│ /sign-up (Clerk SignUp component)                          │
│ • User completes signup (Google/LINE/email)                │
│ • Redirects to /onboarding (afterSignUpUrl)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ /onboarding (NEW ROUTE - OnboardingPage)                   │
│ • Polls GET /auth/profile                                  │
│ • Shows LoadingState while waiting for webhook             │
│ • On 200 + pdpaConsentAt===null: shows PDPAConsentModal    │
│ • On 200 + pdpaConsentAt!==null: redirects to /dashboard   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PDPAConsentModal (NEW COMPONENT)                           │
│ • Forced modal (open, no close button)                     │
│ • Displays PDPA consent text (scrollable)                  │
│ • Checkbox: "I accept the PDPA consent terms"              │
│ • Accept button (disabled until checkbox checked)          │
│ • Decline button                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Decline State (shown on decline)                           │
│ • Shows explanation text                                   │
│ • "Try Again" button (retries consent flow)                │
│ • "Use Different Account" button (signs out)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ /dashboard (with ConsentGate wrapper)                      │
│ • Protected by ProtectedRoute (auth) + ConsentGate         │
│ • ConsentGate checks consent status                        │
│ • If not consented, redirects to /onboarding               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Shadcn Components to Use

### Required (install via CLI)
```bash
pnpm --filter=@sabaipics/ui ui:add dialog checkbox
```

### Component List

| Component | Source | Usage |
|-----------|--------|-------|
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | `@sabaipics/ui/components/dialog` | Consent modal |
| `Checkbox` | `@sabaipics/ui/components/checkbox` | Consent acceptance |
| `Button` | `@sabaipics/ui/components/button` | Accept/Decline/Retry/SignOut |
| `Alert`, `AlertTitle`, `AlertDescription` | `@sabaipics/ui/components/alert` | Error states, decline explanation |
| `Loader2`, `AlertTriangle` | `lucide-react` | Loading spinner, warning icon |

---

## 3. Screen Mockups

### 3.1 Loading State (Polling for webhook)

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│        ⟳ Setting up your account...        │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.2 PDPA Consent Modal

```
┌────────────────────────────────────────────┐
│  PDPA Consent Required                     │
│  We need your consent to process your      │
│  personal data according to PDPA.          │
├────────────────────────────────────────────┤
│                                            │
│  ┌────────────────────────────────────┐    │
│  │ [Scrollable PDPA Text]             │    │
│  │ • Data Processing & Storage        │    │
│  │ • Your Privacy Rights              │    │
│  │ • Data Retention                   │    │
│  │ • Data Sharing                     │    │
│  │ • Security Measures                │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ☐ I accept the PDPA consent terms         │
│                                            │
│  [Decline]              [Accept (disabled)]│
└────────────────────────────────────────────┘
```

### 3.3 Decline Explanation State

```
┌─────────────────────────────────────────────┐
│                                             │
│  ⚠ Consent Required                         │
│  You must accept the PDPA consent terms     │
│  to use SabaiPics. Without consent,         │
│  we cannot process your photos.             │
│                                             │
│  [Try Again]       [Use Different Account]  │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.4 Polling Timeout Error

```
┌─────────────────────────────────────────────┐
│                                             │
│  ⚠ Account Setup Timeout                    │
│  We're taking longer than expected to set   │
│  up your account. Please try again.         │
│                                             │
│  [Retry]                                    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 4. Code Snippets

### 4.1 useConsentStatus Hook

```tsx
// /apps/dashboard/src/hooks/useConsentStatus.ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";

export function useConsentStatus() {
  const { isSignedIn, getToken } = useAuth();

  const query = useQuery({
    queryKey: ["consent-status"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/profile`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    enabled: isSignedIn,
  });

  return {
    isConsented: !!query.data?.data.pdpaConsentAt,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    data: query.data?.data,
  };
}
```

### 4.2 PDPAConsentModal Component

```tsx
// /apps/dashboard/src/components/consent/PDPAConsentModal.tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";
import { Button } from "@sabaipics/ui/components/button";
import { Checkbox } from "@sabaipics/ui/components/checkbox";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@sabaipics/ui/components/dialog";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onAcceptSuccess: () => void;
  onDecline: () => void;
}

export function PDPAConsentModal({ open, onAcceptSuccess, onDecline }: Props) {
  const [isAgreed, setIsAgreed] = useState(false);
  const { getToken } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/consent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 409) {
        throw new Error("Failed to submit consent");
      }
      return response.json();
    },
    onSuccess: onAcceptSuccess,
  });

  return (
    <Dialog open={open} onOpenChange={() => {}} modal>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>PDPA Consent Required</DialogTitle>
          <DialogDescription>
            We need your consent to process your personal data according to
            Thailand's Personal Data Protection Act (PDPA).
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable PDPA text */}
        <div className="max-h-[300px] overflow-y-auto border rounded-lg p-4 bg-muted/30">
          <div className="text-sm space-y-3">
            <p><strong>Data Processing & Storage</strong><br />
            SabaiPics processes and stores photos you upload, including facial
            recognition data for matching photos.</p>
            <p><strong>Your Privacy Rights</strong><br />
            You may request to access, correct, delete, or port your personal
            data at any time.</p>
            <p><strong>Data Retention</strong><br />
            We retain your photos as long as your account is active. Upon deletion,
            we remove all personal data within 30 days.</p>
            <p><strong>Data Sharing</strong><br />
            We do not share your personal data with third parties without consent.</p>
            <p><strong>Security Measures</strong><br />
            We encrypt all data in transit and at rest.</p>
          </div>
        </div>

        {/* Consent checkbox */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="pdpa-consent"
            checked={isAgreed}
            onCheckedChange={(checked) => setIsAgreed(checked === true)}
            disabled={mutation.isPending}
          />
          <label htmlFor="pdpa-consent" className="text-sm font-medium leading-relaxed cursor-pointer">
            I accept the PDPA consent terms and acknowledge that SabaiPics will
            process my personal data as described above.
          </label>
        </div>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Failed to submit consent. Please try again.</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDecline} disabled={mutation.isPending}>
            Decline
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!isAgreed || mutation.isPending}>
            {mutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Accepting...</>
            ) : "Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.3 OnboardingPage Component

```tsx
// /apps/dashboard/src/routes/onboarding.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@sabaipics/auth/react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@sabaipics/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { PDPAConsentModal } from "../components/consent/PDPAConsentModal";
import { useConsentStatus } from "../hooks/useConsentStatus";

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL = 1000;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isConsented, data, refetch } = useConsentStatus();
  const [showModal, setShowModal] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [timeout, setTimeout_] = useState(false);

  // Poll until photographer exists or timeout
  useEffect(() => {
    if (data || timeout) return;
    if (pollAttempts >= MAX_POLL_ATTEMPTS) { setTimeout_(true); return; }
    const timer = setTimeout(() => { refetch(); setPollAttempts(p => p + 1); }, POLL_INTERVAL);
    return () => clearTimeout(timer);
  }, [data, pollAttempts, refetch, timeout]);

  // Check consent once data loads
  useEffect(() => {
    if (!data) return;
    if (isConsented) navigate("/dashboard", { replace: true });
    else setShowModal(true);
  }, [data, isConsented, navigate]);

  // Timeout state
  if (timeout) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Account Setup Timeout</AlertTitle>
            <AlertDescription>Taking longer than expected. Please try again.</AlertDescription>
          </Alert>
          <Button onClick={() => { setPollAttempts(0); setTimeout_(false); refetch(); }} className="w-full">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Decline state
  if (showDecline) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Consent Required</AlertTitle>
            <AlertDescription>
              You must accept PDPA consent to use SabaiPics. Without consent, we cannot process your photos.
            </AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setShowDecline(false); setShowModal(true); }} className="flex-1">
              Try Again
            </Button>
            <Button variant="destructive" onClick={async () => { await signOut(); navigate("/sign-in", { replace: true }); }} className="flex-1">
              Use Different Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Setting up your account...</p>
      </div>
      <PDPAConsentModal
        open={showModal}
        onAcceptSuccess={() => { refetch(); navigate("/dashboard", { replace: true }); }}
        onDecline={() => { setShowModal(false); setShowDecline(true); }}
      />
    </div>
  );
}
```

### 4.4 ConsentGate Component

```tsx
// /apps/dashboard/src/components/auth/ConsentGate.tsx
import { Navigate, useLocation } from "react-router";
import { useConsentStatus } from "../../hooks/useConsentStatus";

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const { isConsented, isLoading } = useConsentStatus();
  const location = useLocation();

  if (isLoading) return <div>Loading...</div>;
  if (!isConsented) return <Navigate to="/onboarding" state={{ from: location }} replace />;
  return <>{children}</>;
}
```

### 4.5 Updated sign-up.tsx

```tsx
// Change afterSignUpUrl from "/dashboard" to "/onboarding"
<SignUp
  routing="path"
  path="/sign-up"
  signInUrl="/sign-in"
  afterSignUpUrl="/onboarding"
/>
```

### 4.6 Updated App.tsx Routes

```tsx
<Routes>
  {/* Public routes */}
  <Route path="/sign-in/*" element={<SignInPage />} />
  <Route path="/sign-up/*" element={<SignUpPage />} />

  {/* Onboarding (auth required, no consent required) */}
  <Route path="/onboarding" element={
    <ProtectedRoute><OnboardingPage /></ProtectedRoute>
  } />

  {/* Protected routes (auth + consent required) */}
  <Route element={
    <ProtectedRoute>
      <ConsentGate><Layout /></ConsentGate>
    </ProtectedRoute>
  }>
    <Route path="/dashboard" element={<DashboardPage />} />
  </Route>

  {/* Root redirect */}
  <Route path="/" element={/* ... */} />
</Routes>
```

---

## 5. States Summary

| Component | State | UI |
|-----------|-------|-----|
| OnboardingPage | Loading | Spinner + "Setting up your account..." |
| OnboardingPage | Timeout | Error alert + Retry button |
| OnboardingPage | Decline | Explanation + Try Again + Sign Out |
| PDPAConsentModal | Idle | Checkbox unchecked, Accept disabled |
| PDPAConsentModal | Checked | Accept enabled |
| PDPAConsentModal | Submitting | Spinner in button, both disabled |
| PDPAConsentModal | Error | Red alert with retry option |
| ConsentGate | Loading | Loading placeholder |
| ConsentGate | Not consented | Redirect to /onboarding |
| ConsentGate | Consented | Render children |

---

## 6. Styling Notes

- Use `text-muted-foreground` for secondary text
- Use `bg-muted/30` for subtle backgrounds
- Use `max-h-[300px] overflow-y-auto` for scrollable content
- Modal width: `sm:max-w-[500px]` (full width on mobile)
- Button heights: default h-9 (36px) for touch targets
- Spacing: `gap-3`, `space-y-4`, `p-4` consistently
