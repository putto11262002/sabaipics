# Logs Scout Report: T-15

**Root:** BS_0001_S-1
**Task:** T-15 — Event creation UI modal
**Scout Date:** 2026-01-11
**Sources Scanned:** T-1 through T-14 implementation summaries

---

## Executive Summary

This report extracts patterns, conventions, and constraints from prior implementation logs (T-1 through T-14) that are relevant to implementing T-15 (Event creation UI modal).

**Key Findings:**
- UI patterns established in T-6, T-11, T-12 (React Query hooks, shadcn components, form validation)
- API patterns established in T-5, T-7, T-8, T-13 (authentication flow, error handling, response envelopes)
- Database schema established in T-1, T-2 (UUID types, timestamp conventions, relations)
- Event API contracts established in T-13 (POST /events with access code + QR generation)

---

## 1. Established Patterns & Conventions

### 1.1 UI Patterns (from T-6, T-11, T-12)

**React Query Hook Pattern:**
- Custom hooks in `apps/dashboard/src/hooks/<domain>/use<Action>.ts`
- Examples:
  - `useDashboardData.ts` (T-11)
  - `useCreditPackages.ts` (T-12)
  - `useConsentStatus.ts` (T-6)
  - `usePurchaseCheckout.ts` (T-12)

**Hook Structure:**
```typescript
export function useEventMutation() {
  const apiClient = useApiClient();
  
  return useMutation({
    mutationFn: async (data) => {
      const token = await apiClient.getToken();
      const res = await fetch(`${apiUrl}/events`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });
      // ... error handling
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}
```

**shadcn Component Usage:**
- Dialog: Used for modals (T-6: PDPA consent modal)
- Form components: Checkbox, Input, Button (T-6, T-12)
- Card components: Used for list displays (T-11, T-12)
- Alert: Used for error states (T-11, T-12)
- Skeleton: Loading states (T-11, T-12)
- Tooltip: Disabled states with explanations (T-11)

**Form Validation Pattern:**
- Zod schemas for validation (API side: T-5, T-7, T-8, T-13)
- UI validation not yet established (no form validation examples in T-6, T-11, T-12)
- Error display: Alert components with descriptive messages

**Loading States:**
- Button with spinner during mutation (T-6, T-12)
- Skeleton components during data fetch (T-11, T-12)
- Disabled state while loading

**Error Handling:**
- Try-catch with error alerts (T-11, T-12)
- Retry buttons in error states (T-11, T-12)
- Generic error messages for network failures

### 1.2 API Patterns (from T-5, T-7, T-8, T-13)

**Request Authentication:**
- All protected endpoints require Bearer token (from Clerk)
- Middleware chain: `requirePhotographer()` → `requireConsent()` (T-2)
- 401: Unauthenticated
- 403: No photographer record OR no consent

**Response Envelopes:**
- Success: `{ data: { ... } }` (T-7, T-8, T-13)
- Error: `{ error: { code, message } }` (established in error handling)

**Error Codes & Status:**
- 400: Validation errors (invalid input)
- 401: Unauthenticated
- 403: Forbidden (no consent)
- 404: Not found
- 409: Conflict (already exists, idempotent)
- 500: Server error

**Event Creation API (T-13):**
- Endpoint: `POST /events`
- Request body:
  ```typescript
  {
    name: string,        // 1-200 chars
    startDate?: string,  // ISO8601
    endDate?: string     // ISO8601, must be >= startDate
  }
  ```
- Response (201):
  ```typescript
  {
    data: {
      id: string,              // UUID
      name: string,
      accessCode: string,      // 6-char uppercase A-Z0-9
      qrCodeUrl: string,       // R2 URL to PNG
      startDate: string | null,
      endDate: string | null,
      expiresAt: string,       // 30 days from creation
      createdAt: string
    }
  }
  ```

**Validation Rules (T-13):**
- Name: 1-200 characters (required)
- Dates: Optional, must be valid ISO8601
- Date range: `startDate <= endDate`
- Access code: Auto-generated, 6-char uppercase A-Z0-9
- QR code: Auto-generated PNG, uploaded to R2

### 1.3 Database Schema (from T-1, T-2)

**UUID Convention:**
- All IDs use native Postgres `uuid` type (not text)
- Generated server-side with `gen_random_uuid()`

**Timestamp Convention (DBSCHEMA-004):**
- All timestamps: `timestamp({ mode: "string", withTimezone: true })`
- Common helpers in `packages/db/src/schema/common.ts`:
  - `timestamptz(name)` - Creates timezone-aware timestamp
  - `createdAtCol()` - Standard created_at with defaultNow

**Events Table (T-1):**
```typescript
{
  id: uuid,
  photographerId: uuid,         // FK to photographers
  name: string,                 // 1-200 chars
  accessCode: string,           // UNIQUE, 6 chars
  qrCodeR2Key: string,          // R2 key (not URL)
  rekognitionCollectionId: string | null,  // Set later by upload
  startDate: timestamp | null,
  endDate: timestamp | null,
  expiresAt: timestamp,         // 30 days from creation
  createdAt: timestamp
}
```

**Indexes:**
- `events_access_code_idx` - For QR lookup (T-1)
- Foreign key indexes on all FK columns

### 1.4 File Naming & Organization

**API Routes:**
- Location: `apps/api/src/routes/<domain>.ts`
- Tests: `apps/api/src/routes/<domain>.test.ts`
- Examples: `consent.ts`, `dashboard.ts`, `credits.ts`, `events.ts`

**Dashboard Hooks:**
- Location: `apps/dashboard/src/hooks/<domain>/use<Action>.ts`
- Examples: 
  - `dashboard/useDashboardData.ts`
  - `credits/useCreditPackages.ts`
  - `credits/usePurchaseCheckout.ts`

**Dashboard Routes:**
- Location: `apps/dashboard/src/routes/<path>/index.tsx`
- Examples: `dashboard/index.tsx`, `credits/packages/index.tsx`, `credits/success/index.tsx`

**Components:**
- Shared UI: `packages/ui/src/components/<component>.tsx`
- App-specific: `apps/dashboard/src/components/<category>/<Component>.tsx`
- Examples (T-6):
  - `apps/dashboard/src/components/consent/PDPAConsentModal.tsx`
  - `apps/dashboard/src/components/auth/ConsentGate.tsx`

---

## 2. Known Limitations & Constraints

### 2.1 From T-1 (Database)
- **FK cascade: RESTRICT** - Prevents accidental deletion, soft delete is future work
- **No transaction wrapper** - Accepted for MVP (most operations are single-insert idempotent)

### 2.2 From T-5 (Consent API)
- **`[KNOWN_LIMITATION]` No transaction wrapping** - Insert consent + update photographer (acceptable, both idempotent-safe)

### 2.3 From T-6 (Signup/Consent UI)
- **`[KNOWN_LIMITATION]` PDPA consent copy is placeholder** - Needs PM review
- **`[KNOWN_LIMITATION]` No UI tests** - Dashboard has no test infrastructure (Vitest not configured)

### 2.4 From T-7 (Dashboard API)
- **`[KNOWN_LIMITATION]` nearestExpiry uses simple MIN** - Not FIFO-aware (acceptable for MVP)

### 2.5 From T-10 (Stripe Webhook)
- **`[KNOWN_LIMITATION]` PromptPay async payments not handled** - `checkout.session.async_payment_succeeded` out of scope

### 2.6 From T-11 (Dashboard UI)
- **`[KNOWN_LIMITATION]` No UI test infrastructure** - Vitest not configured
- **`[KNOWN_LIMITATION]` No pagination** - Events list shows last 10 only (acceptable for MVP)
- **`[KNOWN_LIMITATION]` Build warning** - Bundle size 549 kB (>500 kB threshold, acceptable for dashboard)

### 2.7 From T-12 (Credit Packages UI)
- **`[KNOWN_LIMITATION]` Webhook timing** - Credits may take 1-5 seconds to appear after payment
- **`[ENG_DEBT]` No UI tests** - Same as T-11
- **`[ENG_DEBT]` Bundle size warning** - 555 kB bundle

### 2.8 From T-13 (Events API)
- **`[KNOWN_LIMITATION]` QR URL format** - Uses `${APP_BASE_URL}/r2/${r2Key}` pattern, may need adjustment based on R2 config
- **`[KNOWN_LIMITATION]` Photo count in list** - Not included in GET /events response (can add if UI needs it)

### 2.9 From T-14 (QR Library)
- **`[KNOWN_LIMITATION]` Scannability verification** - Manual testing deferred to T-13 integration
- **QR specs:** 37x37 pixels, ~267 bytes, error correction "M" (15%)

---

## 3. Follow-Up Items Relevant to T-15

### 3.1 From T-11 (Dashboard UI)
- **`[PM_FOLLOWUP]` "Create Event" button** - Currently disabled with tooltip, T-15 will implement modal/flow
- **`[FUTURE_ENHANCEMENT]` Add event click behavior** - Navigate to event detail view (may be separate task)

### 3.2 From T-13 (Events API)
- **`[PM_FOLLOWUP]` Manual QR scannability testing required** - iPhone, LINE, Android

---

## 4. Carry-Forward Constraints for T-15

### 4.1 Authentication & Authorization
✅ **Must use existing auth middleware chain:**
- Event creation modal must be behind authentication
- User must have PDPA consent (enforced by ConsentGate wrapper)
- API endpoint already enforces `requirePhotographer()` + `requireConsent()`

### 4.2 Form Validation
✅ **Must match API validation rules (T-13):**
- Name: Required, 1-200 characters
- Start date: Optional, ISO8601 format
- End date: Optional, ISO8601 format, must be >= startDate if both provided

### 4.3 UI/UX Patterns
✅ **Must follow established patterns:**
- Use Dialog component for modal (like T-6 consent modal)
- Loading state: Button with spinner during mutation
- Error state: Alert component with retry option
- Success handling: Invalidate dashboard query to show new event
- Form fields: Use shadcn Input components

### 4.4 API Integration
✅ **Must call POST /events (T-13):**
- Endpoint: `POST /events`
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
- Body: `{ name, startDate?, endDate? }`
- Response: `{ data: { id, name, accessCode, qrCodeUrl, ... } }`

### 4.5 Data Flow
✅ **After successful event creation:**
1. Close modal
2. Invalidate dashboard query (trigger refetch)
3. Optionally show success toast/alert
4. New event should appear in dashboard events list (T-11)

### 4.6 Error Handling
✅ **Must handle all API error cases:**
- 400: Show validation errors to user
- 401: Redirect to login (Clerk handles)
- 403: Show consent required message (should not happen if ConsentGate works)
- 500: Show generic error with retry button

### 4.7 Date Handling
✅ **Date inputs:**
- Use native HTML date inputs OR date picker library
- Format: Send as ISO8601 strings to API
- Validation: Client-side check for startDate <= endDate before submit

### 4.8 QR Code Display
✅ **After event creation:**
- Event API returns `qrCodeUrl` in response
- May need to display QR in success state (or defer to event detail view)
- QR is already generated and uploaded by T-13 API

### 4.9 Dashboard Integration
✅ **Trigger point (from T-11):**
- Dashboard header has "Create Event" button (currently disabled with tooltip)
- T-15 should:
  - Remove tooltip
  - Enable button
  - Add onClick handler to open modal

### 4.10 Testing Constraints
⚠️ **No UI test infrastructure:**
- Cannot write automated UI tests (Vitest not configured)
- Must rely on manual testing
- Document test cases in summary

---

## 5. Reusable Code Examples

### 5.1 Modal Pattern (from T-6)

```typescript
// PDPAConsentModal.tsx pattern
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@sabaipics/ui/components/dialog";
import { Button } from "@sabaipics/ui/components/button";

export function CreateEventModal({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // ... mutation logic
    setIsSubmitting(false);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {/* Form fields */}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" />}
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 5.2 Mutation Hook Pattern (from T-12)

```typescript
// hooks/events/useCreateEvent.ts
export function useCreateEvent() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; startDate?: string; endDate?: string }) => {
      const token = await apiClient.getToken();
      const res = await fetch(`${apiUrl}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to create event");
      }
      
      const result = await res.json();
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}
```

### 5.3 Error Alert Pattern (from T-11, T-12)

```typescript
{error && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Error</AlertTitle>
    <AlertDescription className="flex items-center gap-2">
      {error.message}
      <Button variant="outline" size="sm" onClick={() => retry()}>
        Retry
      </Button>
    </AlertDescription>
  </Alert>
)}
```

### 5.4 Button with Loading State (from T-6, T-12)

```typescript
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
  Create Event
</Button>
```

---

## 6. Dependencies & Tools Already Available

### 6.1 shadcn Components (from T-6, T-11, T-12)
- Dialog (already added in T-6)
- Button (already added)
- Input (likely already added, verify)
- Alert (already added in T-11)
- Form components (may need to add via shadcn CLI)

### 6.2 React Query (from T-6, T-11, T-12)
- `@tanstack/react-query` already installed
- `useQuery`, `useMutation`, `useQueryClient` available
- Query invalidation pattern established

### 6.3 Date Handling
- `date-fns` already added in T-11
- Can use for date formatting and validation

### 6.4 API Client (from T-6, T-11, T-12)
- `useApiClient()` hook available
- Returns `{ getToken: () => Promise<string> }`

---

## 7. Recommended Implementation Approach

Based on established patterns from T-6, T-11, T-12:

1. **Create mutation hook** (`hooks/events/useCreateEvent.ts`)
   - Follow T-12's `usePurchaseCheckout` pattern
   - Invalidate dashboard query on success

2. **Create modal component** (`components/events/CreateEventModal.tsx`)
   - Follow T-6's PDPAConsentModal pattern
   - Use Dialog, Form, Input, Button from shadcn
   - Client-side validation before submit

3. **Update dashboard** (`routes/dashboard/index.tsx`)
   - Remove tooltip from "Create Event" button
   - Add modal state and onClick handler
   - Pass modal open/close props to CreateEventModal

4. **Add form validation**
   - Name: Required, max 200 chars
   - Dates: Optional, validate startDate <= endDate
   - Show inline validation errors

5. **Handle success state**
   - Close modal
   - Optionally show success toast
   - Dashboard will auto-refresh (query invalidation)

6. **Handle error states**
   - Network errors: Generic retry
   - 400 validation errors: Show field-specific errors
   - Other errors: Generic error alert

---

## 8. Files to Create/Modify

### New Files:
- `apps/dashboard/src/hooks/events/useCreateEvent.ts`
- `apps/dashboard/src/components/events/CreateEventModal.tsx`

### Modified Files:
- `apps/dashboard/src/routes/dashboard/index.tsx` (enable button, add modal)

### Possibly Need to Add (via shadcn CLI):
- Form components (if not already added)
- Input component (if not already added)
- Label component (if not already added)

---

## 9. Validation Checklist (Based on Prior Tasks)

Before marking T-15 complete, verify:

✅ **Build & Type Check:**
- `pnpm --filter=@sabaipics/dashboard build` passes
- `pnpm check-types` passes

✅ **Manual Testing:**
- [ ] Open dashboard → click "Create Event" → modal opens
- [ ] Submit with empty name → validation error shown
- [ ] Submit with name > 200 chars → validation error shown
- [ ] Submit with endDate < startDate → validation error shown
- [ ] Submit valid event → success, modal closes, event appears in list
- [ ] Network error → error alert with retry button
- [ ] Retry after error → re-attempts creation

✅ **Integration:**
- [ ] Dashboard query invalidates after creation
- [ ] New event appears in dashboard events list
- [ ] Event has access code and QR URL (verify API response)

✅ **Responsive:**
- [ ] Modal displays correctly on mobile
- [ ] Form fields stack properly on mobile
- [ ] Buttons are touch-friendly

---

## 10. Summary of Key Constraints

| Constraint | Source | Impact on T-15 |
|------------|--------|----------------|
| Must use Dialog component | T-6 | Use shadcn Dialog for modal |
| Must invalidate dashboard query | T-11, T-12 | Add `queryClient.invalidateQueries(["dashboard"])` |
| Must follow mutation hook pattern | T-12 | Create `useCreateEvent.ts` hook |
| Must validate name 1-200 chars | T-13 | Add client-side validation |
| Must validate startDate <= endDate | T-13 | Add date range validation |
| Cannot write UI tests | T-6, T-11, T-12 | Document manual test cases only |
| Must use Bearer token auth | T-2, T-5, T-13 | Use `apiClient.getToken()` |
| Must handle 400/401/403/500 errors | All API tasks | Add comprehensive error handling |
| Button loading states | T-6, T-12 | Add spinner during submit |
| Error alerts with retry | T-11, T-12 | Use Alert component with retry button |

---

## Files Scanned

- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-1/summary/iter-002.md`
- `/docs/logs/BS_0001_S-1/implementation/T-2/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-3/summary-1.md`
- `/docs/logs/BS_0001_S-1/implementation/T-4/summary-1.md`
- `/docs/logs/BS_0001_S-1/implementation/T-5/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-6/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-7/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-8/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-9/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-10/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-11/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-12/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-13/summary/iter-001.md`
- `/docs/logs/BS_0001_S-1/implementation/T-14/summary/iter-001.md`

---

**End of Logs Scout Report**
