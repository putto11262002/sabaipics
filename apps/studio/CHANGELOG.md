# Changelog

iOS Studio architecture changes. See `ARCHITECTURE.md` for current design.

---

## 2026-01-20

### Update 7: Multi-Vendor Event Source Architecture
**Status:** Implemented

Refactored Canon polling into protocol-based architecture for multi-vendor support.

| Component | Purpose |
|-----------|---------|
| `CameraEventSource` | Protocol for vendor-specific event monitoring |
| `CanonEventSource` | Canon polling (0x9116) - extracted from PTPIPSession |
| `StandardEventSource` | Wraps PTPIPEventMonitor for Sony/Fuji/etc |
| `NikonEventSource` | Stub (TODO: implement 0x90C7 polling) |
| `PhotoOperationsProvider` | Protocol for download operations |

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

| Parameter | Value |
|-----------|-------|
| Start | 50ms |
| Backoff | +50ms per idle cycle |
| Max | 200ms |
| Reset | Immediate on events |

**Files:** PTPIPSession.swift

---

### Update 4: LiveCaptureView Direct Observation
**Status:** Implemented

Fixed photo list not updating by changing observation pattern:

| Before | After |
|--------|-------|
| `@EnvironmentObject coordinator` | `@ObservedObject session: TransferSession` |
| Global alert state in coordinator | Local `@State` in view |
| `coordinator.requestDisconnect()` | `session.end()` directly |

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
