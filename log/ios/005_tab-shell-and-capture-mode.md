# iOS Studio - Tab Shell + Capture Mode Plan

Date: 2026-01-22

## Problem

Current Studio UX is a single linear wizard driven by `AppCoordinator.appState` (manufacturer -> hotspot -> discovery -> transfer).

This is a good strict flow for capture, but it makes the app hard to extend for:

- profile + sign out
- viewing/choosing events
- viewing sync/upload status
- future settings/diagnostics

## Goal

Reframe Studio into a tab-based app shell with a prominent "Start Capture" primary action.

Key idea:

- Capture remains a strict flow.
- Everything else becomes normal navigable sections.

## Proposed UX

Signed-in landing screen: `MainTabView`

- Tab: Events
  - view/select current event
  - (future) show event details
- Primary action (center button): Start Capture
  - presents capture flow full-screen
- Tab: Profile
  - show user identity
  - sign out
  - (future) diagnostics / app settings

Capture behavior:

- Capture is presented as a full-screen mode (`fullScreenCover`), not a tab root.
- When capture ends, dismiss back to tabs.

## Event gating (default)

Starting capture requires an event selection.

- If there is no selected event, tapping Start Capture routes the user to Events tab (and shows a prompt).
- Event is locked while a capture session is active (no mid-session switching).

## Architecture

### Auth gate remains

`RootFlowView` remains responsible only for auth:

- Signed out: show `AuthView()`.
- Signed in: show `MainTabView()`.

### Capture flow stays unchanged

The existing capture wizard (`ContentView` + `AppCoordinator.appState`) remains unchanged.

The tab shell simply presents it as a full-screen cover.

## Implementation Notes

- Use `TabView` for the main navigation.
- Implement a center floating action button overlayed above the tab bar for "Start Capture".
- Keep capture session state in `AppCoordinator` and dismiss when the session ends.

## Follow-ups

- Replace placeholder Events/Profile views with real consent + event selection gates.
- Add a Sync tab that surfaces upload queue state.
