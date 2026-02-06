# Capture Tab + Live Session Plan

Goal

- Make Capture a first-class tab with a clear "Capture Home" entry screen.
- Keep connection/onboarding flows as normal navigation (not modal).
- Represent live capture as a persistent session with a pinned status bar + toggleable details sheet.
- Keep architecture closure-driven (leaf views emit events; router/coordinator owns global state).
- Stub upload integration via callbacks/events (no upload queue implementation yet).

Workable Slices

Slice 1: Add Capture Tab Shell

- Add a new tab item "Capture" in `apps/studio/SabaiPicsStudio/Views/MainTabView.swift`.
- Create `apps/studio/SabaiPicsStudio/Views/Capture/CaptureTabRootView.swift`.
  - Hosts a `NavigationStack`.
  - Renders a placeholder `CaptureHomeView`.
- Remove the current modal entry (`.sheet(CaptureModeView)` / capture button) once the tab exists.

Slice 2: Capture Home (UI only, closure-driven)

- Create `apps/studio/SabaiPicsStudio/Views/Capture/CaptureHomeView.swift`.
  - Sections: "Recent Sony", "Recent Canon" (read-only list for now).
  - CTAs: "Connect new camera", "Manual IP".
  - Outputs (closures):
    - `onConnectNew()`
    - `onReconnect(brand, id)`
    - `onManualIP()`

Slice 3: Session Store (no uploads yet)

- Create `apps/studio/SabaiPicsStudio/Stores/CaptureSessionStore.swift`.
  - State: `idle | connecting | active | error`.
  - Stats: `downloadsCount`, `lastFilename`, `startedAt`.
  - Sheet state: `isDetailsPresented`.
- Methods:
  - `start(activeCamera:)`
  - `disconnect()`
  - `handle(event:)` (updates stats only)

Notes / Follow-ups

- PTP/IP disconnect paths (`PTPIPSession.disconnect()`, `TransferSession.end()`) currently have no hard timeout.
  Discovery cleanup uses a UI-level timeout (`cleanupWithTimeout`), but session teardown itself can still run long.
  Track as tech debt: add an explicit disconnect timeout + always-force-close sockets + idempotent teardown.

Slice 4: Status Bar + Details Sheet (UI only)

- Create `apps/studio/SabaiPicsStudio/Views/Capture/CaptureStatusBarView.swift`.
  - Shows camera name + stats.
  - Buttons: `Open`, `Disconnect`.
- Create `apps/studio/SabaiPicsStudio/Views/Capture/CaptureSessionSheetView.swift`.
  - Shows live stats and a simple log list (optional).
- Wire into `CaptureTabRootView`:
  - Show status bar when sessionStore.state != idle.
  - Present `.sheet` when `isDetailsPresented == true`.

Slice 5: Wire existing flows into Capture tab (Sony first)

- In `CaptureTabRootView`, route into the existing closure-driven modules:
  - manufacturer selection
  - Sony onboarding (`SonyWiFiOnboardingView`)
  - shared discovery (`UnifiedCameraDiscoveryView` with Sony strategy)
- On discovery selection:
  - build `ActiveCamera` (via coordinator/helper)
  - call `sessionStore.start(activeCamera:)`
  - set `sessionStore.isDetailsPresented = true` (auto-open on first connect)
  - navigate back to Capture Home

Follow-ups

- Refactor connect wizard navigation from `CaptureFlowCoordinator.state` switching to native `NavigationPath` once Capture session + live feed is stable.

Slice 6: Cleanup navigation/state (remove legacy modal flow)

- Remove `CaptureModeView` entry points if still present.
- Shrink `CaptureFlowCoordinator` responsibilities to only what's needed inside Capture tab navigation,
  or replace it with a smaller local navigation state.

Slice 7: Canon migration (later)

- Add Canon strategy/guidance to shared discovery stack.
- Route Canon discovery to `UnifiedCameraDiscoveryView`.
- Retire `apps/studio/SabaiPicsStudio/Views/CameraDiscoveryView.swift`.

Slice 8: Upload callback integration (later)

- Introduce an `UploadQueue` / `UploadPipeline` interface.
  - Inject into `CaptureSessionStore` as the handler for `photoDownloaded` events.

Follow-ups

- Capture Home "Recent Sony" should be powered by `SonyAPConnectionCache.shared.listRecords()` and call `onReconnect("sony", record.id)`.
  Today `CaptureHomeView` is UI-only placeholders and does not observe any recents store.

---

# Camera Network Scanner Refactoring Plan

**Date:** 2026-02-06
**Goal:** Create a new, cleaner `CameraNetworkScanner` service with better API, logging, and error handling.

## 🎯 Overview

Replace the complex `NetworkScannerService` (967 lines) with a simplified, focused scanner service. The old service works well but has accumulated complexity. We'll create a new service alongside it, copying the working logic while simplifying the interface.

**Key Principle:** Scanner only scans. Caller manages discovered camera lifecycle.

---

## 1. New Service Interface

### Main Class

```swift
@MainActor
class CameraNetworkScanner {
    // Published state (observe from UI/ViewModel)
    @Published private(set) var state: ScanState
    @Published private(set) var error: ScanError?

    // Discovery callback (transfers ownership to caller)
    var onCameraDiscovered: ((DiscoveredCamera) -> Void)?

    // Simple API
    func scan(targets: [String], config: ScanConfig = .default)
    func stop()

    deinit // Auto-cancels running scan
}
```

### Supporting Types

```swift
enum ScanState: Equatable {
    case idle
    case scanning(current: Int, total: Int, currentIP: String?)
    case completed(found: Int)
}

enum ScanError: Error {
    case cancelled
    case noTargets
    case networkUnavailable
    case timeout
}

struct ScanConfig {
    var timeout: TimeInterval = 2.0
    var maxRetries: Int = 3
    var retryDelay: TimeInterval = 0.5

    static let `default` = ScanConfig()
}
```

---

## 2. Copy from Old Service ✅

**These parts work well - reuse them:**

- **PTP/IP handshake logic** - The `scanIP()` method with full 5-stage handshake
- **Parallel scanning** - TaskGroup approach for scanning all IPs simultaneously
- **TCP retry logic** - Handles slow camera startup (ECONNREFUSED, ETIMEDOUT)
- **Connection helpers:**
  - `waitForConnection()` - Async wrapper for NWConnection state
  - `sendData()` - Send data with continuation
  - `receiveWithTimeout()` - Receive with timeout using TaskGroup
- **Persistent GUID** - Shared GUID for PTP/IP connections (Canon compatibility)
- **Error classification** - Map NWError POSIX codes to failure kinds
- **Retryable error detection** - Know when to retry vs fail fast

---

## 3. Simplify/Change 🔄

### API Changes

- ✅ **Single scan method** - Only `scan(targets:config:)`, no dual overloads
- ✅ **Callback for discoveries** - No owned camera list, transfer ownership via callback
- ✅ **Published error** - Use `@Published var error` instead of throwing
- ✅ **Config object** - Use `ScanConfig` struct instead of multiple parameters
- ✅ **Only scan supplied IPs** - No automatic subnet detection or range expansion

### Implementation Changes

- ✅ **Structured logging** - Replace scattered `print()` with structured logger
- ✅ **Simpler state** - Progress info included in `ScanState.scanning`
- ✅ **Single-pass scanning** - Remove wave-based retry (simplify to one TaskGroup pass)
- ✅ **No session management** - Scanner doesn't track or cleanup discovered sessions

---

## 4. Remove ❌

**Move these responsibilities elsewhere:**

- `isHotspotActive()` - Move to network utility helper
- Hardcoded hotspot subnet scanning (172.20.10.2-20)
- `startScan()` with no parameters - No default subnet scanning
- `disconnectOtherCameras()` - Caller manages camera lifecycle
- `disconnectAllCameras()` - Caller manages camera lifecycle
- `cleanup()` method - No cleanup needed (callback transfers ownership)
- Wave-based scanning - Over-engineered for current needs
- `@Published var lastDiscoveryDiagnostics` - Log diagnostics internally instead
- `@Published var currentScanIP` - Now part of `ScanState.scanning`

---

## 5. Migration Strategy

### Phase 1: Create New Service

1. ✅ Create `CameraNetworkScanner.swift` in `Services/Discovery/`
2. ✅ Copy working logic from `NetworkScannerService`
3. ✅ Apply simplifications from plan
4. ✅ Add structured logging
5. ✅ Write unit tests (if feasible)

### Phase 2: Remove Wrapper Layer

1. ✅ Update `CameraDiscoveryViewModel` to use `CameraNetworkScanner` directly
2. ✅ Remove `NetworkScannerDiscoverer` (thin wrapper, no longer needed)
3. ✅ Remove `CameraDiscovering` protocol (premature abstraction)

### Phase 3: Deprecate Old Service

1. ⏸️ Leave `NetworkScannerService` in place (deprecated)
2. ⏸️ Add `@available(*, deprecated)` annotation
3. ⏸️ Remove after confirming new service works in production

---

## 6. Usage Example

### Before (Old Service + Wrapper):

```swift
let discoverer = NetworkScannerDiscoverer()
let viewModel = CameraDiscoveryViewModel(discoverer: discoverer, ...)

// Two scan methods, confusing
discoverer.startScan()  // Hotspot default
discoverer.startScan(candidateIPs: [...], perIPTimeout: 2.0)  // Custom

// Must cleanup sessions
await discoverer.cleanup()
```

### After (New Service):

```swift
let scanner = CameraNetworkScanner()

// Callback receives discovered cameras
scanner.onCameraDiscovered = { camera in
    viewModel.addCamera(camera)  // Caller owns it now
}

// Simple, explicit scanning
let targets = ["192.168.1.1", "192.168.1.2", "192.168.1.3"]
scanner.scan(targets: targets)

// Stop scan (no cleanup needed)
scanner.stop()

// Caller manages camera lifecycle
await viewModel.disconnectAllCameras()
```

---

## 7. Benefits

✅ **Simpler API** - One scan method, clear ownership model
✅ **Better separation** - Scanner scans, caller manages lifecycle
✅ **Cleaner logging** - Structured, filterable logs
✅ **Less code** - Remove wrapper layer, diagnostics publishing, cleanup methods
✅ **More flexible** - Caller provides IPs, decides what to scan
✅ **Easier testing** - Clearer interface, callback-based
✅ **No premature abstraction** - Wait for real UPnP implementation before creating protocol

---

## 8. Non-Goals (Out of Scope)

❌ UPnP/SSDP discovery implementation
❌ Automatic subnet detection utilities
❌ Camera session lifecycle management
❌ Upload queue integration
❌ Multi-protocol support (PTP/IP only for now)

---

## 9. Follow-Up Tasks

- [ ] Create subnet utility: `NetworkUtils.hotspotRange() -> [String]`
- [ ] Move `isHotspotActive()` to `NetworkUtils`
- [ ] Consider structured logger abstraction for app-wide use
- [ ] Document PTP/IP protocol flow for future maintainers
- [ ] Add retry strategies documentation (when to retry vs fail fast)

---

**Status:** Ready to implement
**Next Step:** Create `CameraNetworkScanner.swift`
