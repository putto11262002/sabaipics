# Changelog

iOS Studio architecture changes. See `ARCHITECTURE.md` for current design.

---

## 2026-01-29

### Update 20: Events Browser UI + Theme Refinements

**Status:** Implemented

Refined Events Browser UI to match iOS native patterns and updated theme to match web design system.

**Events Browser Changes:**
- Redesigned EventDetailView to match ProfileView pattern (Form with LabeledContent)
- Removed logo display from detail page
- Changed subtitle layout to full-width VStack for proper text wrapping
- Moved copy actions to toolbar menu (search + slideshow links)
- Added `.listRowBackground(Color.Theme.card)` for visible list item borders
- Added relative time display ("2 days ago") in event list
- Added PostgreSQL timestamp parser for API date format compatibility

**Theme Updates:**
- Applied global tint (`.tint(Color.Theme.primary)`) to root view for consistent theming
- Updated theme colors from purple to neutral grayscale matching web design system
- Primary: `#343434` (light) / `#DEDEDE` (dark) - neutral gray instead of purple
- All 15 theme color assets updated to neutral palette

**Files:**
- Views: EventsHomeView.swift, EventDetailView.swift, EventRow.swift
- Theme: SabaiPicsStudioApp.swift, Assets.xcassets/Colors/Theme*.colorset
- Utilities: DateFormatter+Extensions.swift
- API: EventsAPIClient.swift (MainActor.run for Clerk session access)
- Docs: IOS/EVENTS_BROWSER.md

---

## 2026-01-28

### Update 19: Canon Cleanup Before Socket Cancel

**Status:** Implemented (untested)

Adjusted disconnect flow so `eventSource.cleanup()` runs before CloseSession and socket cancellation, allowing Canon cleanup to drain events and send `SetEventMode(0)` successfully.

**Files:** Services/PTPIPSession.swift, docs/PTP_IP_ARCHITECTURE.md

---

### Update 18: Capture Without Event Selection

**Status:** Implemented

Removed the temporary event-selection gate from the Capture tab so camera capture can start without selecting an event.

**Files:** Views/MainTabView.swift

---

## 2026-01-27

### Update 17: Canon Graceful Disconnect (SAB-57)

**Status:** Implemented (untested)

Added PTP spec-compliant disconnect handling for Canon cameras, matching gphoto2lib's `camera_exit()` pattern.

**Problem:** Our disconnect sent `CloseSession` without proper Canon cleanup. Camera may continue trying to report events and not return to normal state.

**Solution:** Updated `CanonEventSource.cleanup()` to perform graceful shutdown:

| Step | Action                 | Purpose                          |
| ---- | ---------------------- | -------------------------------- |
| 1    | `drainPendingEvents()` | Poll once to clear event queue   |
| 2    | `disableEventMode()`   | Send `SetEventMode(0)` to camera |
| 3    | `stopMonitoring()`     | Stop polling loop                |
| 4    | Clear references       | Release connections              |

**New Methods:**

- `drainPendingEvents()` - Polls Canon GetEvent once to clear pending events
- `disableEventMode()` - Sends `SetEventMode(0)` to disable event reporting

**Files:** CanonEventSource.swift, PTP_IP_ARCHITECTURE.md

---

## 2026-01-26

### Update 16: Design System (Theme Colors + Button Styles)

**Status:** Implemented

Added design system matching web shadcn/ui theme. Colors auto-adapt to light/dark mode.

- Created `Color.Theme.*` namespace with 17 semantic colors
- Created reusable button styles: `.primary`, `.secondary`, `.ghost`, `.destructive`
- Colors synced from `packages/ui/src/styles/globals.css` (OKLCH → hex via culori)
- ClerkTheme now uses full color mapping
- Primary brand color: `#9f6db1` (magenta/purple)

**Files:** Theme/Colors.swift, Theme/ButtonStyles.swift, Assets.xcassets/Colors/Theme\*.colorset

**Docs:** IOS/THEME.md

---

### Update 15: Portrait Lock

**Status:** Implemented

Locked app to portrait orientation only (like Instagram/TikTok).

**Files:** Config/SabaiPicsStudio-Info.plist

---

### Update 14: ProfileView with Clerk Account Portal

**Status:** Implemented

Enhanced Profile tab with user info display and Clerk's account management portal.

- Shows user avatar via `UserButton()`
- Displays username (fallback: full name, then email prefix)
- Shows email as secondary info
- "Manage Account" opens Clerk's `UserProfileView()` in sheet
- "Sign Out" button with red/destructive styling

**Files:** Views/ProfileView.swift

---

### Update 13: Clerk AuthView in Sheet

**Status:** Implemented

Switched from custom auth UI to Clerk's prebuilt `AuthView()` in a sheet with branded welcome screen.

- New `WelcomeWithClerkSheetView` - branded entry with Sign In / Create Account buttons
- Sign In opens `AuthView(mode: .signIn)`
- Create Account opens `AuthView(mode: .signUp)`
- Applied `ClerkTheme` for consistent styling (borderRadius 12, removed focus ring)
- `RootFlowView` now uses `WelcomeWithClerkSheetView`

**Files:** Views/Auth/WelcomeWithClerkSheetView.swift, Views/RootFlowView.swift

---

### Update 12: Auth Provider Button Compliance

**Status:** Implemented

Refined the custom auth welcome screen to follow Google/LINE button guidelines.

- Email sign-in button is now outlined (matches the neutral provider button weight).
- Google sign-in button uses the app's outline style with the official Google "G" icon.
- LINE sign-in button is now a native button following LINE button guidelines (base `#06C755`, pressed overlay, separator).
- Copy:
  - Google: "Continue with Google"
  - LINE: "Log in with LINE"

**Files:** Views/Auth/WelcomeView.swift, Assets.xcassets

---

## 2026-01-25

### Update 11: Camera Discovery Retry Logic (SAB-37)

**Status:** Implemented

Added two-layer retry strategy for more reliable camera discovery:

**Layer 1 - Scan Waves:**

- Runs full IP scan up to 3 times
- 3s delay between waves
- Handles cameras joining network after scan starts
- Removed 30s view timeout - waves complete naturally

**Layer 2 - Per-IP Retry:**

- Retries TCP connection up to 3 times per IP
- 0.5s delay between retries
- Smart error classification (retry ECONNREFUSED/ETIMEDOUT, fail fast on EHOSTUNREACH/EACCES)

**Connection Timeout Fix:**

- Replaced TaskGroup-based timeout with polling-based approach
- NWConnection callbacks run on background queue (avoids main thread deadlock)
- 50ms polling interval, 2s hard timeout guaranteed
- Fixes issue where connections hung for 75s instead of timing out

**Timing:**
| Case | Time |
|------|------|
| Camera ready immediately | ~2-3s |
| Camera joins during wave 2 | ~6-9s |
| No camera found | ~15s max |

**Files:** NetworkScannerService.swift, CameraDiscoveryView.swift, PTP_IP_ARCHITECTURE.md

---

### Update 10: Double-Disconnect Bug Fix (SAB-41)

**Status:** Implemented

**Problem:** Disconnect button required two taps to work. First tap appeared to do nothing, second tap succeeded.

**Root Cause:** Event monitoring tasks were hanging on network I/O calls (`send()`, `receive()`) during disconnect. Tasks were cancelled, but pending network operations waited for timeout (30s) instead of being interrupted.

**Solution:** Two-part fix:

1. Added `withTaskCancellationHandler` to network calls in `CanonEventSource.pollCanonEvent()` - interrupts operations immediately on cancellation
2. Added `connection.cancel()` before awaiting task completion in both `CanonEventSource.stopMonitoring()` and `PTPIPEventMonitor.stopMonitoring()` - forces pending network operations to fail immediately

**Disconnect Sequence (Critical Order):**

```
stopMonitoring():
  1. isMonitoring = false (breaks loop condition)
  2. connection.cancel() (interrupts pending send/receive)
  3. task.cancel() (marks task as cancelled)
  4. await task.value (waits for cleanup to complete)
  5. task = nil (release reference)
```

**Files:** CanonEventSource.swift, PTPIPEventMonitor.swift

---

## 2026-01-22

### Update 9: Tab Shell + Capture Mode Entry

**Status:** Implemented

Reframed Studio as a tab-based app with capture as a full-screen mode.

- Added a native tab bar with an action-style Capture tab (presents capture via full-screen cover).
- Added `CaptureModeView` wrapper so capture can be closed consistently back to the main app shell.
- Added placeholder Events and Profile screens to support event gating + sign out.

**Files:** RootFlowView.swift, MainTabView.swift, CaptureModeView.swift, EventsHomeView.swift, ProfileView.swift

---

### Update 8: Clerk Authentication (iOS)

**Status:** Implemented

Added Clerk-based sign-in to Studio.

- Clerk iOS SDK integrated via Swift Package Manager.
- App reads `CLERK_PUBLISHABLE_KEY` from build settings and injects it into Info.plist (`ClerkPublishableKey`).
- `RootFlowView` gates access: signed out shows custom auth UI; signed in continues to app shell.
- Added local dev config pattern (`Studio.Local.xcconfig` copied from example; gitignored).

**Files:** SabaiPicsStudioApp.swift, RootFlowView.swift, SabaiPicsStudio.xcodeproj/project.pbxproj, Config/SabaiPicsStudio-Info.plist, Config/Studio.\*.xcconfig

---

## 2026-01-20

### Update 7: Multi-Vendor Event Source Architecture

**Status:** Implemented

Refactored Canon polling into protocol-based architecture for multi-vendor support.

| Component                 | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `CameraEventSource`       | Protocol for vendor-specific event monitoring        |
| `CanonEventSource`        | Canon polling (0x9116) - extracted from PTPIPSession |
| `StandardEventSource`     | Wraps PTPIPEventMonitor for Sony/Fuji/etc            |
| `NikonEventSource`        | Stub (TODO: implement 0x90C7 polling)                |
| `PhotoOperationsProvider` | Protocol for download operations                     |

**Files:** CameraEventSource.swift (new), CanonEventSource.swift (new), StandardEventSource.swift (new), NikonEventSource.swift (new), PTPIPSession.swift

---

### Update 6: RAW File Skip Warning Banner

**Status:** Implemented

- Added `PTPIPSessionDelegate.didSkipRawFile()` method
- Added `TransferSession.skippedRawCount` and `showRawSkipBanner`
- Added dismissible warning banner in LiveCaptureView (glass + amber background)
- Fixed `@MainActor` protocol conformance for delegate

**Files:** PTPIPSession.swift, TransferSession.swift, LiveCaptureView.swift, WiFiCameraService.swift

---

### Update 5: Canon EOS Adaptive Polling

**Status:** Implemented

Changed Canon polling from fixed 2-second interval to adaptive 50-200ms (libgphoto2 pattern).

| Parameter | Value                |
| --------- | -------------------- |
| Start     | 50ms                 |
| Backoff   | +50ms per idle cycle |
| Max       | 200ms                |
| Reset     | Immediate on events  |

**Files:** PTPIPSession.swift

---

### Update 4: LiveCaptureView Direct Observation

**Status:** Implemented

Fixed photo list not updating by changing observation pattern:

| Before                            | After                                      |
| --------------------------------- | ------------------------------------------ |
| `@EnvironmentObject coordinator`  | `@ObservedObject session: TransferSession` |
| Global alert state in coordinator | Local `@State` in view                     |
| `coordinator.requestDisconnect()` | `session.end()` directly                   |

**Files:** LiveCaptureView.swift, ContentView.swift, AppCoordinator.swift

---

### Update 3: Unified Camera Discovery View

**Status:** Implemented

Changed CameraDiscoveryView from two-state UI (scanning vs results) to unified layout:

- Camera list always visible and selectable during scan
- Small status indicator instead of full-screen spinner
- Removed IP address and progress numbers from UI

**Files:** CameraDiscoveryView.swift

---

### Update 2: Robust Scanning with Cancellation Support

**Status:** Implemented

Added cancellation checks at each scan stage with COMMIT POINT logic:

- Early stages: check `Task.isCancelled`, cleanup on cancel
- Session preparation stage: complete even if cancelled (valuable session)

**Files:** NetworkScannerService.swift

---

### Update 1: Separate stopScan() from Session Disconnect

**Status:** Implemented

**Problem:** `stopScan()` was disconnecting cameras, causing premature disconnects on timeout.

**Solution:** Split responsibilities:

- `stopScan()` - Only cancels scan tasks
- `disconnectOtherCameras(except:)` - Explicit disconnect for non-selected
- `disconnectAllCameras()` - Explicit disconnect all
- `cleanup()` - stopScan + disconnectAll + reset

**Files:** NetworkScannerService.swift, CameraDiscoveryView.swift, AppCoordinator.swift
