# Upstream Dossier: T-15

**Execution root:** `BS_0001_S-1`
**Task ID:** T-15
**Type:** feature
**Primary surface:** UI
**Generated:** 2026-01-11

---

## Task Goal

Create events list on dashboard, event creation modal, and QR code display/download.

**Story refs:** US-5, US-6
**Scope:** `apps/dashboard/src/routes/events/`, `apps/dashboard/src/components/`

---

## Acceptance Criteria

- Event list shows name, dates, photo count, QR thumbnail
- Create modal with name (required), start/end dates (optional)
- Event detail shows large QR with both URLs
- "Download QR" button downloads PNG
- Links open in new tab

---

## Dependencies

| Task | Status | Notes |
|------|--------|-------|
| T-13 | Done | Events API (CRUD + QR generation) |

**All dependencies met:** Yes

---

## Load-Bearing References

### Primary

- **Execution plan:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/plan/final.md`
  - Phase 3 Events (US-5, US-6)
  - Database schema: events table
  - API contracts

### Research

- **QR code library:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/research/qr-code-library.md`
  - Library choice: `@juit/qrcode`
  - QR contains two URLs (search + slideshow)
  - PNG format for download

---

## Implied Contracts

### API Endpoints (T-13)

**POST /events**
```typescript
Request: {
  name: string;           // required
  start_date?: string;    // optional ISO date
  end_date?: string;      // optional ISO date
}
Response: {
  id: string;
  name: string;
  access_code: string;    // 6-char code
  qr_code_url: string;    // R2 URL for PNG
  start_date?: string;
  end_date?: string;
  expires_at: string;     // created_at + 30 days
  created_at: string;
}
```

**GET /events**
```typescript
Response: {
  events: Array<{
    id: string;
    name: string;
    access_code: string;
    qr_code_url: string;
    photo_count: number;
    face_count: number;
    start_date?: string;
    end_date?: string;
    created_at: string;
    expires_at: string;
  }>
}
```

**GET /events/:id**
```typescript
Response: {
  id: string;
  name: string;
  access_code: string;
  qr_code_url: string;        // R2 presigned URL or public URL
  photo_count: number;
  face_count: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  expires_at: string;
}
```

**Certainty:** High (T-13 marked done, API implemented)

### QR Code URLs

QR PNG contains two URLs:
```
Search URL:    https://sabaipics.com/search/{accessCode}
Slideshow URL: https://sabaipics.com/event/{accessCode}/slideshow
```

**Plan reference:** final.md lines 277-282

**Certainty:** High (explicit in plan)

### Database Schema

**events table** (from final.md line 184):
```
id, photographer_id, name, start_date, end_date, 
access_code, qr_code_r2_key, rekognition_collection_id, 
expires_at, created_at
```

**Certainty:** High (T-1 marked done)

---

## Gaps & Uncertainties

### [NEED_VALIDATION] QR code storage URL pattern

**Question:** Is `qr_code_url` in API response:
- Option A: Public R2 URL (`https://photos.sabaipics.com/qr/{eventId}.png`)
- Option B: Presigned R2 URL (temporary, needs refresh)
- Option C: API proxy endpoint (`/events/:id/qr`)

**Impact:** Download implementation, caching strategy

**Recommendation:** Check T-13 implementation for actual response shape.

---

### [NEED_VALIDATION] Event list source

**Question:** Where does event list render?
- Option A: Dashboard page (from T-11)
- Option B: Dedicated `/events` route
- Option C: Both (dashboard shows recent, dedicated page shows all)

**Plan ambiguity:** T-11 acceptance says "Lists events with photo counts" but T-15 scope is `apps/dashboard/src/routes/events/`

**Recommendation:** 
- Dashboard (T-11) already has event list
- T-15 adds `/events/:id` detail page for QR display/download
- T-15 may enhance event list with QR thumbnail

---

### [NEED_VALIDATION] Create modal location

**Question:** Where does "Create Event" button live?
- Plan (final.md line 289): "Click 'Create Event' → modal"
- T-11 acceptance (tasks.md line 289): "'Create Event' button opens modal"

**Implication:** Modal component may already exist in dashboard (T-11), or T-15 creates it.

**Recommendation:** Check T-11 PR #19 to see if modal stub exists.

---

### [GAP] QR thumbnail size

**Question:** What size should QR thumbnail be on event list?
- Plan silent on thumbnail dimensions
- Research recommends "M" error correction level

**Recommendation:** Use 200px x 200px thumbnail (QR is square, scales well).

---

### [GAP] QR display size on detail page

**Question:** What size for "large QR" on event detail?
- Plan says "large QR" but no dimensions specified

**Recommendation:** 
- Display: 400px x 400px (mobile-friendly)
- Download: Full PNG from R2 (typically 1000px+ for print quality)

---

### [GAP] Date formatting

**Question:** How to display start_date/end_date?
- Plan: dates are optional, ISO format in API
- No locale/timezone guidance

**Recommendation:** 
- Display in Thai locale (th-TH)
- Use browser timezone
- Format: "15 ม.ค. 2026" or "15 Jan 2026" (check existing patterns in dashboard)

---

### [GAP] Empty state

**Question:** What to show when photographer has 0 events?
- Not specified in acceptance

**Recommendation:** 
- Empty state illustration + "Create your first event" CTA
- Consistent with dashboard empty state (T-11)

---

## Test Coverage

From tasks.md lines 387-389:
- Component tests for event card
- Test create modal validation

**Missing from acceptance (recommend adding):**
- Test QR download flow
- Test QR URL display (search + slideshow)
- Test date validation (end_date >= start_date if both provided)

---

## Risks & Rollout

**Risk level:** Low (from tasks.md line 391)

**No additional risks identified** in this dossier analysis.

---

## Key Decisions Affecting T-15

From final.md decisions table (lines 19-42):

| # | Decision | Impact on T-15 |
|---|----------|----------------|
| 7 | QR codes: eager generation, two URLs | QR already generated by T-13, UI just displays |
| 11 | Credit packages UI: dedicated page | Pattern established for dedicated routes |
| 14 | Data retention: delete QR after 30 days | UI should handle missing QR gracefully (future) |

---

## Related Tasks

| Task | Relation | Status |
|------|----------|--------|
| T-11 | Dashboard UI, may contain event list stub | Done |
| T-13 | Events API, QR generation | Done |
| T-19 | Upload + Gallery UI (next in Phase 4) | Pending |

---

## Success Path (from final.md lines 446-448)

6. Creates "Wedding 2026-01-15" event
7. Gets QR with search + slideshow URLs
12. Views gallery with thumbnails (fast, CDN cached)

**User journey for T-15:**
1. Photographer on dashboard clicks "Create Event"
2. Modal opens: enters "Wedding 2026-01-15", selects start/end dates
3. Submits → `POST /events` → modal closes
4. Event card appears in list with QR thumbnail
5. Clicks event card → detail page
6. Sees large QR, both URLs displayed
7. Clicks "Download QR" → PNG downloads
8. Prints QR, distributes at event

---

## Out of Scope (from final.md lines 460-469)

- Slideshow functionality (W-4): URL exists but shows "Coming soon"
- Gallery share link (W-7)
- Event editing/deletion (not in US-5/US-6)

---

## Implementation Hints

1. **Check T-11 PR #19** for existing event list component
2. **Check T-13 PR #22** for actual API response shapes
3. **Date picker:** Use shadcn DatePicker component
4. **Modal:** Use shadcn Dialog component
5. **Download:** Use `<a download="event-{accessCode}-qr.png" href={qrUrl}>`
6. **Link target:** `target="_blank" rel="noopener noreferrer"`
7. **QR display:** Simple `<img>` tag, no special libraries needed
8. **Validation:** Name required, dates optional but end >= start if both provided

---

## Summary

**Ready to implement:** Yes (T-13 done)
**Blockers:** None
**Open questions:** 4 validation items (URL pattern, list location, modal location, thumbnail size)
**Recommended first step:** Review T-11 and T-13 PRs to clarify validation items, then draft component structure.
