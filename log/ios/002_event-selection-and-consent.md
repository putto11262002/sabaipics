# iOS Studio - Consent + Event Selection Plan

Date: 2026-01-21

## Goal

Add pre-PTP gates in the iOS Studio app (`apps/studio`) for:

1) PDPA consent (required by backend for photographer routes)
2) Event selection (required for upload destination)

This should integrate cleanly with the existing PTP flow without expanding the PTP state machine.

## Proposed UI Flow

Gating stack (full-screen, in order):

`AuthGateView` → `ConsentGateView` → `EventSelectionGateView` → existing `ContentView` (PTP camera flow)

Notes:
- Keep `AppCoordinator.appState` focused on camera/PTP states.
- Gates are additive wrapper views around the existing PTP app.

## Consent Gate

### Backend API

- `GET /consent`
  - Response includes `data.isConsented` and `data.consentedAt`
- `POST /consent`
  - Records PDPA consent for the authenticated photographer

### UI

Consent view should be intentionally minimal:

- Title: "Consent required"
- Short explanation (2-4 bullets):
  - why we collect data
  - where uploads go
  - that the photographer must accept before using event APIs
- Primary CTA: "I agree"
- Secondary action: "Sign out"

Behavior:
- On load, call `GET /consent`.
- If consented, continue to Event Selection.
- If not consented, show consent screen.
- On "I agree", call `POST /consent`, then proceed.

## Event Selection Gate

### Backend API

- `GET /events` (requires consent)
  - Used to display the photographer's events.
- Optional: `GET /events/:id`
  - Can validate the stored selection (if needed).

### UI: Settings-style list

Use SwiftUI `List` with `Section` and `.listStyle(.insetGrouped)` to achieve an iPhone Settings feel.

Row design:
- Left: event name (headline)
- Subtitle: date range and/or expiry
- Right: checkmark for selected event
- Tap row to select

### Grouping rules (default)

We group events into sections for fast selection:

- "Current" (optional): the currently selected event (if any)
- "Active": events where today is within start/end window (or otherwise considered active)
- "Upcoming": events with startDate in the future
- "Recent": events that ended within the last 7 days
- "Older": other non-expired events

Default decisions:
- Recent window: 7 days
- Expired events: hidden by default (not shown)

### Selection persistence

Persist the selected event id locally (initially UserDefaults):

- Key: `selectedEventId`
- On app start (after auth/consent), read the key and attempt to reconcile with current event list.

### Refresh + empty states

- Support pull-to-refresh via `.refreshable { await loadEvents() }`.
- Empty state if no events are returned:
  - message: "No events assigned"
  - button: "Refresh"

## Interaction with PTP Flow

### Event locking policy (default)

Lock the selected event for the duration of a transfer session.

Rationale:
- Avoids mixing uploads from one camera session into multiple events.
- Makes it clear where photos are going.

Implementation guideline:
- Allow changing the selected event only when not transferring.
- In `LiveCaptureView`, display the selected event in the header (read-only during session).

## Open Questions (not locked yet)

- How to define "Active" when start/end dates are nil or partial (backend supports optional dates)
- Whether we should allow an "Expired" section (currently default is hidden)
