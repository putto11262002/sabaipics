# iOS Studio App Shell (Tabs + Capture Mode)

This doc describes the high-level navigation and information architecture of the iOS Studio app.

The key idea is to keep the camera/transfer flow strict and linear, while making the rest of the app extensible.

## Intent

- Use a native iOS bottom tab bar for the main app.
- Treat photo capture/transfer as a full-screen "mode" the user enters/exits.
- Avoid growing `AppCoordinator.appState` into an everything-state-machine.

## Current structure

### Root auth gate

`RootFlowView` is responsible for:

- Signed out: show Clerk auth UI
- Signed in: show the main app shell

See also: `apps/studio/docs/ios/auth.md`.

### Main tabs

`MainTabView` uses a native `TabView` with 3 tab items:

- Events
  - (Today) placeholder UI for selecting an event id
  - (Next) real event list + selection (requires consent)
- Capture (action tab)
  - tapping triggers capture mode presentation
  - selection immediately reverts to the previous non-capture tab
- Profile
  - sign out, account details

### Capture mode

Capture is presented full-screen via `fullScreenCover`.

`CaptureModeView` currently wraps the existing capture wizard (`ContentView`) and provides a consistent "Close" affordance that:

- ends any active `TransferSession`
- resets the coordinator back to manufacturer selection
- dismisses back to tabs

## Event gating policy

Default policy:

- Starting capture requires an event selection.
- If no event is selected, tapping the Capture tab routes to Events and shows an alert.

This prevents ambiguous upload destination once cloud sync is introduced.

## Why the Capture tab is an action tab (vs floating button)

We intentionally avoid a floating center button overlay because:

- Floating buttons are not a standard iOS pattern.
- Overlays tend to react to keyboard safe area changes ("jumping" when text fields focus).

Using a real tab item keeps behavior native and predictable.

## Key files

- `apps/studio/SabaiPicsStudio/Views/RootFlowView.swift`
- `apps/studio/SabaiPicsStudio/Views/MainTabView.swift`
- `apps/studio/SabaiPicsStudio/Views/CaptureModeView.swift`

Placeholder screens (will be replaced by real implementations):

- `apps/studio/SabaiPicsStudio/Views/EventsHomeView.swift`
- `apps/studio/SabaiPicsStudio/Views/ProfileView.swift`
