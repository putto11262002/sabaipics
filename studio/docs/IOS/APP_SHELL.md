# iOS Studio App Shell (Tabs + Capture)

## Intent

- Use a native iOS bottom tab bar for the main app.
- Capture tab has its own NavigationStack with sheet-based connection flows.
- Connection flows are per-manufacturer step machines sharing a common discovery UI.

## Root auth gate

`RootFlowView` is responsible for:

- Signed out: show custom branded auth UI
- Signed in: show the main app shell

See also: `AUTH.md`.

## Main tabs

`MainTabView` uses a native `TabView` with 3 tab items:

- **Events** — event list + detail view
- **Capture** — camera connection + photo transfer
- **Profile** — sign out, account details

## Capture tab architecture

```
MainTabView
  └── Capture tab
        └── CaptureTabRootView (owns NavigationStack + session store)
              ├── CaptureHomeView
              │     ├── "Connect new camera" menu (Sony / Canon / Nikon)
              │     ├── Recent Sony section (tap to reconnect, swipe to remove)
              │     └── Recent Canon section (same)
              │
              ├── .sheet(item: $activeSheet)
              │     ├── .sony → NavigationStack → SonyConnectFlowView
              │     └── .canon → NavigationStack → CanonConnectFlowView
              │
              └── CaptureStatusBarView (inline bar when session active)
                    └── taps → CaptureSessionSheetView (photo list + disconnect)
```

### Connection flows as sheets

Connection flows (Sony, Canon) are presented as `.sheet` instead of navigation push.

**Why:**

- SwiftUI tab switches dismiss pushed views → leaked PTP/IP connections
- Sheets persist across tab switches
- Each presentation creates fresh state
- Full dismissal control (swipe-to-dismiss blocked)

**SwiftUI constraint:** Only one `.sheet` per view. We use `.sheet(item:)` with an `ActiveSheet` enum.

### Sony flow steps

`SonyConnectFlowView` step machine:

1. **Decision** — new camera or reconnect from saved list
2. **Onboarding** — QR scan or manual SSID/password entry
3. **WiFi join** — `NEHotspotConfiguration` join + network check
4. **Discovery** — `CameraDiscoveryScreen` (shared)
5. **Select** → `onConnected(activeCamera)` → sheet dismisses

### Canon flow steps

`CanonConnectFlowView` step machine:

1. **Hotspot check** — soft-gate alert if Personal Hotspot not active
2. **Discovery** — `CameraDiscoveryScreen` (shared)
3. **Select** → `onConnected(activeCamera)` → sheet dismisses

### Active session

After connecting, `CaptureSessionStore` owns the `TransferSession`. The capture tab shows:

- `CaptureStatusBarView` — inline bar with camera name and photo count
- Tapping opens `CaptureSessionSheetView` — full photo list with disconnect button

## Key files

- `Views/MainTabView.swift`
- `Views/RootFlowView.swift`
- `Views/Capture/CaptureTabRootView.swift`
- `Views/Capture/CaptureHomeView.swift`
- `Views/Capture/CaptureSessionSheetView.swift`
- `Views/Capture/CaptureStatusBarView.swift`
- `Views/Sony/SonyConnectFlowView.swift`
- `Views/Canon/CanonConnectFlowView.swift`
- `Views/Shared/CameraDiscoveryScreen.swift`
- `Stores/CaptureSessionStore.swift`
