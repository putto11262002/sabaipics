# Event UI Changes for SAB-53 - Simplify PDPA Consent

## Date

January 27, 2026

## Summary

Added sessionStorage logic for one-time consent per session. Users only see consent checkbox once per browser session.

## Changes Made

### 1. ConsentStep Component (`apps/event/src/components/ConsentStep.tsx`)

**Added**: sessionStorage check on mount

- Checks if `pdpa_consent_accepted` exists in sessionStorage
- If consented in session: auto-accepts checkbox and auto-continues after 100ms
- Allows UI to update before auto-continuing

**Code Added**:

```tsx
const CONSENT_STORAGE_KEY = 'pdpa_consent_accepted';

// Check sessionStorage for existing consent in this session
useEffect(() => {
  const hasConsented = sessionStorage.getItem(CONSENT_STORAGE_KEY);
  if (hasConsented === 'true' && !accepted) {
    onAcceptChange(true);
    setTimeout(() => {
      onContinue();
    }, 100);
  }
}, [onAcceptChange, onContinue]);
```

### 2. Search Route (`apps/event/src/routes/events/search.tsx`)

**Added**: useEffect to check sessionStorage on mount

- Checks if `pdpa_consent_accepted` exists in sessionStorage
- If consented and still on consent state: skip to upload immediately

**Updated**: `handleConsentAccept` to store consent

- Now stores `'true'` in `sessionStorage` when user accepts consent

**Code Added**:

```tsx
import { useEffect } from 'react';

// Check sessionStorage for existing consent in this session
useEffect(() => {
  const hasConsented = sessionStorage.getItem('pdpa_consent_accepted');
  if (hasConsented === 'true' && state === 'consent') {
    setConsentAccepted(true);
    setState('upload');
  }
}, [state]);

const handleConsentAccept = useCallback(() => {
  setConsentAccepted(true);
  // Store consent in sessionStorage for this session
  sessionStorage.setItem('pdpa_consent_accepted', 'true');
  setState('upload');
}, []);
```

## Verification

```bash
pnpm --filter=@sabaipics/event build
```

Build completed successfully with no TypeScript errors.

## Behavior Changes

### Before

1. User visits event search
2. Shows full-screen consent page
3. Must check checkbox every time
4. No session persistence

### After

1. User visits event search
2. Shows inline consent checkbox (same UI)
3. First check → Stores in `sessionStorage` → Continues to upload
4. Same session → Auto-skips consent, goes directly to upload
5. New session (tab closed + reopened) → Shows checkbox again
6. New tab → Shows checkbox again (separate session per tab)

## Notes

- `sessionStorage` is cleared when tab/window is closed (per issue requirement)
- Each browser tab has its own session (expected behavior)
- No changes to consent API request payload (sends `consentAccepted=true`)
- Existing consent_records table unchanged (tracks backend consent only)

## Benefits

1. Better UX: Users only consent once per session
2. Meets issue requirement: "must only require one time check for the entire session"
3. Simplified: No full-screen consent page needed
4. Privacy-friendly: Session cleared on tab close
