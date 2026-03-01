# Risk Scout Report

**Task:** T-15 — Events UI (list + create modal + QR display)
**Root:** BS_0001_S-1
**Date:** 2026-01-11

## Executive Summary

T-15 implements the events management UI, building on top of the already-completed Events API (T-13). This is a standard CRUD UI task with moderate complexity around modal state management and QR code display/download. Key risks center on event creation UX flow, QR code download functionality across mobile browsers, and proper integration with the dashboard event list.

---

## High-Impact Risks

### 1. Create Event Modal Integration Point

**Risk:** The dashboard (T-11) already shows a disabled "Create Event" button. T-15 must wire this up without breaking existing dashboard state.

**Analysis:**

- Dashboard currently shows: `<Button variant="outline" size="sm" disabled>Create Event</Button>` (apps/dashboard/src/routes/dashboard/index.tsx:201-204)
- Button is wrapped in a tooltip showing "Event creation coming soon"
- T-15 must replace this with a functional modal trigger

**Implementation approach:**

```typescript
// Dashboard needs:
1. Remove `disabled` prop
2. Add onClick handler to open modal
3. Pass refetch callback to refresh events after creation
```

**Coupling risk:** Dashboard event list uses `useDashboardData()` hook which fetches from `/dashboard` API. After event creation, need to invalidate this query cache to show new event in list.

**Mitigation:**

- Use React Query's `queryClient.invalidateQueries(['dashboard'])` after successful creation
- OR: Optimistic update (add event to local cache immediately)

`[NEED_DECISION]` Invalidate vs optimistic update for dashboard refresh?

---

### 2. QR Code Display and Download UX

**Risk:** QR codes must be scannable on mobile cameras (iOS/Android) and downloadable for print/share. The implementation must work across different browser environments.

**Analysis from T-13:**

- QR PNG uploaded to R2 at `qr/${accessCode}.png`
- QR URL pattern: `${APP_BASE_URL}/r2/${r2Key}` (T-13 summary line 68)
- QR contains search URL: `https://sabaipics.com/search/{accessCode}` (plan final.md:278-281)

**Critical questions:**

1. **Display method:** `<img>` tag vs canvas rendering?
2. **Download mechanism:**
   - Browser download via anchor `download` attribute
   - Or fetch blob and create object URL?
3. **Mobile browser compatibility:**
   - iOS Safari doesn't allow programmatic downloads without user gesture
   - LINE in-app browser has download restrictions
   - Android Chrome/Samsung Internet behavior varies

**Evidence from codebase:**

- No existing image download patterns in codebase
- Credit packages page uses simple `<img>` tags (packages/index.tsx)
- No blob download utilities exist

**Mitigation approach:**

```typescript
// Option A: Simple anchor download (works on desktop, limited mobile support)
<a href={qrCodeUrl} download={`${event.name}-QR.png`}>
  <Button>Download QR</Button>
</a>

// Option B: Fetch + blob download (better mobile compatibility)
const downloadQR = async () => {
  const response = await fetch(qrCodeUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.name}-QR.png`;
  a.click();
  URL.revokeObjectURL(url);
};
```

`[NEED_DECISION]` QR download strategy: simple anchor vs fetch+blob approach?

**Testing requirements:**

- [ ] Scan QR with iPhone camera (iOS 15+)
- [ ] Scan QR with LINE app QR scanner
- [ ] Download QR on iOS Safari (may open in new tab instead of download)
- [ ] Download QR on Android Chrome
- [ ] Print QR and verify scannability (error correction level M per T-14)

---

### 3. Event Creation Modal State Management

**Risk:** Modal needs proper form validation, loading states, error handling, and cleanup on close. State bugs could leave modal in broken state.

**Analysis:**

- Dialog component exists in packages/ui (dialog.tsx found in component list)
- No existing modal forms in codebase for reference pattern
- Credit packages page uses simple button clicks (no modals)
- Dashboard page has no form inputs

**Modal state requirements:**

1. **Form state:** name (required), startDate (optional), endDate (optional)
2. **Loading state:** During API call to POST /events
3. **Error state:** API errors, validation errors
4. **Success state:** Close modal, refresh event list, show toast/success message?
5. **Reset state:** Clear form on close or success

**Validation requirements (from T-13 schema):**

- name: 1-200 characters (createEventSchema line 8)
- startDate: ISO datetime or null
- endDate: ISO datetime or null
- Date range: startDate <= endDate (validated in API, line 107)

**Form library decision:**

- No form library detected in dashboard codebase
- Options: React Hook Form, native controlled inputs, Formik
- Credit packages page uses native state management

`[GAP]` No form library or pattern established in dashboard codebase

`[NEED_DECISION]` Use React Hook Form or native controlled form state?

---

### 4. Event List Display vs Dashboard Event List

**Risk:** Potential confusion between two event lists - dashboard shows recent events, but task spec mentions "events list on dashboard" and separate event detail pages.

**Analysis from task spec:**

- Task T-15: "Create events list on dashboard, event creation modal, and QR code display/download"
- Acceptance: "Event list shows name, dates, photo count, QR thumbnail"

**Current dashboard implementation (T-11):**

- Dashboard already displays event list (dashboard/index.tsx lines 189-257)
- Shows: name, createdAt, expiresAt, photoCount, faceCount
- No QR thumbnail currently shown
- Events are not clickable (no navigation)

**Interpretation:**
T-15 should enhance the existing dashboard event list with:

1. QR thumbnail display (small preview of QR code)
2. Clickable event cards → navigate to event detail page
3. Create Event modal accessible from dashboard

**Navigation structure:**

```
/dashboard
  - Event list (existing, from T-11)
  - "Create Event" button → opens modal (T-15)
  - Event card click → navigate to /events/:id (T-15)

/events/:id (NEW in T-15)
  - Event detail page
  - Large QR display
  - Download QR button
  - Photo gallery (T-19 will add upload/gallery)
```

`[NEED_VALIDATION]` Should T-15 create new `/events` route or enhance existing dashboard display?

**Recommendation:** Create `/events/:id` detail route, enhance dashboard event cards to be clickable.

---

### 5. QR Code URL Exposure in API Response

**Risk:** T-13 implementation constructs QR URL as `${APP_BASE_URL}/r2/${r2Key}` which may not match actual R2 public URL pattern.

**Evidence from T-13 summary:**

- Line 68: `[KNOWN_LIMITATION] QR URL format: Uses ${APP_BASE_URL}/r2/${r2Key} pattern - may need adjustment based on R2 public URL configuration`
- TODO comment in events/index.ts line 175: "Confirm R2 public URL format - may need adjustment based on bucket config"

**Current state:** No R2 public URL proxy endpoint exists in API routes.

**Options:**

1. **Public R2 bucket:** Configure bucket for public read, use direct R2 URL
2. **API proxy endpoint:** Create `GET /r2/:key` to stream from R2 with auth check
3. **Presigned URLs:** Generate time-limited presigned URLs (like photo downloads in T-18)

**Security consideration:** QR codes contain event access codes, which are semi-public (printed on venue posters). Public read is acceptable for QR images.

`[NEED_DECISION]` R2 QR code access strategy: public bucket vs API proxy vs presigned URLs?

**Impact on T-15:** If QR URL format changes, event detail page must use correct pattern.

---

## Medium-Impact Risks

### 6. Mobile Browser Event Creation UX

**Risk:** Modal form input on mobile devices (especially LINE in-app browser) may have UX issues.

**Specific concerns:**

- iOS Safari date pickers in modals
- Virtual keyboard overlapping modal content
- LINE in-app browser form submission quirks

**Mitigation:**

- Use native HTML5 date input (better mobile support than custom pickers)
- Test modal overflow/scroll behavior with keyboard open
- Add `viewport` meta tag if missing (check dashboard index.html)

---

### 7. Event Expiry Display

**Risk:** Events expire 30 days after creation (plan final.md:274). UI should communicate this clearly.

**Analysis:**

- Dashboard already shows: "Expires {formatDistanceToNow(parseISO(event.expiresAt))} from now" (dashboard/index.tsx:236)
- Good pattern to reuse

**Recommendation:** Show expiry on event detail page as well, with warning if < 7 days remaining.

---

### 8. Photo Count Display Before Photos Uploaded

**Risk:** New events have photoCount = 0. Empty state UX needed.

**Analysis:**

- Dashboard already handles this: shows "0" in event card (dashboard/index.tsx:242)
- Event detail page should have empty state: "No photos uploaded yet. Upload your first photo!"

**Not a blocker:** Handled in T-19 (Upload + Gallery UI)

---

## Coupling / Dependencies

### Direct API dependencies (complete)

- **T-13 (Events API):** POST /events, GET /events, GET /events/:id - DONE (PR #22, merged)
- **T-14 (QR Library):** QR generation - DONE (PR #18, merged)

### Indirect dependencies (complete)

- **T-11 (Dashboard UI):** Event list display - DONE (PR #19, merged)
- **T-7 (Dashboard API):** Event data in dashboard response - DONE (PR #12, merged)
- **Auth middleware:** requirePhotographer + requireConsent - DONE

### Shared state

- **Dashboard event list cache:** React Query cache for `/dashboard` endpoint
- **Router state:** React Router navigation between dashboard and event detail

### Hidden coupling discovered

1. **Dashboard "Create Event" button:** Disabled placeholder exists, T-15 must wire it up
2. **Event card click behavior:** Currently not clickable, T-15 must add navigation
3. **QR URL construction:** T-13 left TODO about R2 URL format, T-15 must use correct pattern

---

## Edge Cases to Handle

### Event Creation Edge Cases

1. **Duplicate event names allowed**
   - No uniqueness constraint in API (T-13)
   - Photographers may create multiple events with same name (e.g., "Wedding")
   - UI should not prevent this

2. **Empty start/end dates**
   - Both optional (T-13 schema lines 9-10)
   - Form should allow leaving dates blank
   - Validation: if both provided, startDate <= endDate

3. **Long event names**
   - Max 200 characters (T-13 schema line 8)
   - UI should show character counter or limit input

4. **API errors during creation**
   - Access code generation failure (T-13 retries 5 times, returns 500 if all fail)
   - QR generation failure (very rare, library-level error)
   - R2 upload failure (network, bucket permissions)
   - DB insert failure (connection, constraints)

   All errors return 500 with specific error codes. UI should show user-friendly message: "Failed to create event. Please try again."

### QR Display Edge Cases

1. **Missing QR image**
   - If R2 upload failed but event created, `qrCodeUrl` exists but fetch returns 404
   - UI should show placeholder: "QR code unavailable. Please contact support."

2. **QR scannability issues**
   - Users report QR doesn't scan → test on multiple devices
   - Error correction level M (15%) per T-14 research
   - QR content includes full URL (not just access code)

3. **QR download filename**
   - Should be descriptive: `${event.name}-QR.png` sanitized (remove special chars)
   - Max filename length for cross-platform compatibility (~100 chars)

---

## Security Considerations

### Authorization

- **Event detail page:** Should only show events owned by photographer
- API already returns 404 for non-owned events (T-13 line 285)
- UI should not expose event IDs of other photographers (no enumeration)

### QR Code Public Access

- QR images are semi-public (printed on posters)
- Access codes are not secret (guests scan QR to search photos)
- No sensitive data in QR image itself
- Public R2 bucket acceptable for QR storage

### Form Input Sanitization

- Event name XSS risk: React escapes by default, safe to display
- Date inputs: HTML5 validation prevents non-date strings
- API has Zod validation (T-13), double layer of protection

---

## Decision Points (Human-in-Loop Required)

### [NEED_DECISION] Dashboard Refresh Strategy

**Context:** After creating event, dashboard event list needs to update.

**Options:**

- A) Invalidate React Query cache → refetch from API (guaranteed consistency)
- B) Optimistic update → add event to local cache immediately (better UX, potential sync issues)

**Recommendation:** Option A (invalidate + refetch) - simpler, less risk of cache desync

---

### [NEED_DECISION] QR Download Implementation

**Context:** Mobile browsers have varying download behavior.

**Options:**

- A) Simple `<a download>` - works on desktop, limited mobile support
- B) Fetch blob + createObjectURL - better mobile compatibility, more code
- C) Both: detect mobile and use appropriate method

**Recommendation:** Option B (fetch blob) - better cross-platform support for target market (Thai mobile users)

---

### [NEED_DECISION] R2 Public URL Access Pattern

**Context:** T-13 left QR URL format as TODO.

**Options:**

- A) Public R2 bucket with direct URL: `https://pub-{bucket}.r2.dev/qr/{code}.png`
- B) API proxy: `GET /api/r2/:key` (requires implementation)
- C) Presigned URLs with expiry (overkill for QR codes)

**Recommendation:** Option A (public bucket) - QR codes are meant to be public, simplest approach

**Action required:** Configure R2 bucket for public read, update T-13 QR URL construction

---

### [NEED_DECISION] Form Library Choice

**Context:** No form library in dashboard codebase yet.

**Options:**

- A) React Hook Form (most popular, good validation integration)
- B) Native controlled state (simpler, no dependency)
- C) Formik (older, still viable)

**Recommendation:** Option B (native state) for this simple 3-field form. Add React Hook Form later if forms become more complex.

---

### [NEED_VALIDATION] Event Detail Route Structure

**Context:** Task spec says "QR code display/download" but doesn't specify URL structure.

**Options:**

- A) `/events/:id` - dedicated detail page
- B) `/dashboard/events/:id` - nested under dashboard
- C) Modal on dashboard (no separate route)

**Recommendation:** Option A (`/events/:id`) - allows deep linking, cleaner separation

---

## Gaps

### [GAP] No Form Component Pattern

**Issue:** Dashboard has no form components or validation patterns.

**Resolution:** Create simple controlled form with native validation. Extract to reusable pattern if needed later.

---

### [GAP] No Toast/Notification System

**Issue:** After event creation success, how to notify user?

**Current workaround:** Modal close + optimistic update/refetch shows new event in list (implicit success)

**Alternative:** Add toast notification library (e.g., sonner, react-hot-toast)

`[NEED_DECISION]` Add toast library or rely on implicit feedback?

---

### [GAP] No Event Detail Page Layout

**Issue:** No existing pattern for detail pages in dashboard.

**Resolution:** Follow dashboard layout pattern with `<PageHeader>` component and back navigation.

---

### [GAP] QR Thumbnail Size Not Specified

**Issue:** Task acceptance says "QR thumbnail" but no size specified.

**Options:**

- Small icon (32px x 32px) - barely scannable, just visual indicator
- Medium thumbnail (100px x 100px) - scannable on desktop
- Large preview (200px x 200px) - scannable on mobile

**Recommendation:** 80px x 80px thumbnail on dashboard, 400px x 400px on detail page, full size download

---

## Merge Conflict Hotspots

### High Risk: `apps/dashboard/src/routes/dashboard/index.tsx`

**Reason:** T-11 already modified this file. T-15 will add:

- Create Event modal integration (remove disabled prop, add onClick)
- Event card click handlers (add navigation)
- Potential QR thumbnail display

**Mitigation:** Coordinate changes carefully, test dashboard doesn't break

---

### Medium Risk: `apps/dashboard/src/App.tsx`

**Reason:** Adding `/events/:id` route to router configuration.

**Mitigation:** Add route in protected section alongside `/dashboard`

---

### Low Risk: `packages/ui/src/components/`

**Reason:** May need to add form components (label, input, textarea) if not already present.

**Mitigation:** Use shadcn CLI to add components, creates isolated files

---

## Implementation Checklist

### Pre-implementation

- [ ] Verify T-13 merged and deployed
- [ ] Confirm R2 QR URL access pattern (public bucket config)
- [ ] Check if dialog/form components exist in packages/ui
- [ ] Review dashboard event list code (T-11)

### Implementation

**1. Event Creation Modal**

- [ ] Create `CreateEventModal` component
- [ ] Form fields: name (text), startDate (date), endDate (date)
- [ ] Validation: name required, date range check
- [ ] Loading state during API call
- [ ] Error state with user-friendly messages
- [ ] Success: close modal, invalidate dashboard cache
- [ ] Wire modal to dashboard "Create Event" button

**2. Event Detail Page**

- [ ] Create `/events/:id` route in App.tsx
- [ ] Fetch event data from GET /events/:id
- [ ] Display event info (name, dates, expiry, access code)
- [ ] Large QR code display (400px x 400px)
- [ ] Download QR button with fetch+blob approach
- [ ] Both URLs displayed (search + slideshow)
- [ ] Back to dashboard navigation
- [ ] Loading/error states
- [ ] 404 handling (event not found)

**3. Dashboard Enhancements**

- [ ] Add QR thumbnail to event cards (80px x 80px)
- [ ] Make event cards clickable → navigate to /events/:id
- [ ] Remove disabled prop from "Create Event" button
- [ ] Wire button to open CreateEventModal

### Validation

- [ ] Test event creation (valid data)
- [ ] Test event creation (invalid data - empty name, bad date range)
- [ ] Test event creation (API errors - simulate 500)
- [ ] Test event list refresh after creation
- [ ] Test QR download (desktop Chrome/Firefox/Safari)
- [ ] Test QR download (mobile iOS Safari)
- [ ] Test QR download (mobile Android Chrome)
- [ ] Test QR download (LINE in-app browser)
- [ ] Test QR scannability with phone camera (iOS/Android)
- [ ] Test QR scannability with LINE app
- [ ] Test event detail page navigation
- [ ] Test event detail page with missing QR image (404)
- [ ] Test auth: non-owned event returns 404

---

## Rollout / Ops

### Environment Variables

- `APP_BASE_URL` - Already configured (used by T-13)
- `VITE_API_URL` - Already configured (dashboard API client)

### R2 Configuration

- [ ] Configure `PHOTOS_BUCKET` for public read access (if using public URL approach)
- [ ] Test QR image access from public URL
- [ ] Verify R2 lifecycle rule for 30-day QR deletion (T-0.6)

### Monitoring

- Event creation success/failure rate
- QR download clicks (analytics)
- QR scan rate (out of scope - requires client-side tracking)

---

## Follow-ups

### [ENG_DEBT]

- Extract form pattern to reusable hook if more forms needed
- Add toast notification library for better success feedback
- Add event deletion UI (API endpoint exists in T-13)
- Add event edit UI (would need PATCH endpoint)

### [PM_FOLLOWUP]

- Confirm QR download behavior acceptable on target devices (Thai photographers)
- Verify QR content format (search + slideshow URLs)
- Provide copy for empty states (no events, no photos)

### [DESIGN_FOLLOWUP]

- QR thumbnail design (show access code on card?)
- Event card click target (whole card vs specific button?)
- Event detail page layout (specs not in plan)

---

## Risk Assessment Summary

| Risk Category                | Level  | Mitigation                                         |
| ---------------------------- | ------ | -------------------------------------------------- |
| API integration              | LOW    | T-13 complete, contracts clear                     |
| Modal state management       | MEDIUM | Use established dialog component, test edge cases  |
| QR download UX               | MEDIUM | Test on target devices, use fetch+blob approach    |
| Dashboard coupling           | MEDIUM | Careful coordination with T-11 changes             |
| Mobile browser compatibility | MEDIUM | Extensive testing on Thai mobile devices           |
| R2 URL format                | LOW    | Clarify public bucket config before implementation |
| Authorization                | LOW    | API already handles ownership checks               |
| Form validation              | LOW    | Simple form, native validation sufficient          |

---

## Recommendation

**Proceed with implementation.** T-13 (Events API) is complete and merged. Risks are manageable with proper testing and coordination with existing dashboard code (T-11). No blocking HI gates identified.

**Critical path:**

1. Clarify R2 public URL pattern (coordinate with ops/infra)
2. Create event creation modal (wire to dashboard button)
3. Create event detail route with QR display/download
4. Enhance dashboard event cards (clickable, thumbnails)
5. Test QR download on mobile devices
6. Test QR scannability on iOS/Android cameras and LINE app

**Estimated effort:** 2-3 days (including mobile testing)

---

## Provenance

**Files examined:**

- `docs/logs/BS_0001_S-1/tasks.md` - Task definition (T-15)
- `docs/logs/BS_0001_S-1/plan/final.md` - Execution plan
- `apps/dashboard/src/routes/dashboard/index.tsx` - Dashboard implementation (T-11)
- `apps/dashboard/src/routes/credits/packages/index.tsx` - UI patterns reference
- `apps/dashboard/src/App.tsx` - Router configuration
- `apps/dashboard/src/lib/api.ts` - API client pattern
- `apps/api/src/routes/events/index.ts` - Events API implementation (T-13)
- `apps/api/src/routes/events/schema.ts` - Events API schemas
- `docs/logs/BS_0001_S-1/implementation/T-13/summary/iter-001.md` - T-13 summary
- `docs/logs/BS_0001_S-1/implementation/T-13/context/upstream-dossier.md` - T-13 context
- `docs/logs/BS_0001_S-1/implementation/T-11/context/upstream-dossier.md` - T-11 context
- `docs/logs/BS_0001_S-1/implementation/T-6/context/risk-scout.md` - Modal patterns reference
- `docs/logs/BS_0001_S-1/implementation/T-12/context/risk-scout.md` - UI risk patterns reference
- `packages/ui/src/components/*.tsx` - Available UI components
