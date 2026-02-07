# SabaiPics Studio - PTP/IP Architecture

## Overview

iOS app for professional photographers to wirelessly transfer photos from Sony, Canon, and Nikon cameras via PTP/IP protocol over WiFi.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    iOS device (SabaiPics Studio)                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   SwiftUI   │───▶│   Capture   │───▶│    Network/Protocol     │  │
│  │   Views     │    │   Stores    │    │       Services          │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ WiFi (PTP/IP over TCP port 15740)
                              ▼
                ┌──────────────────────────┐
                 │ Sony / Canon / Nikon     │
                 │         Camera           │
                 └──────────────────────────┘
```

---

## Connection Flow Architecture

Connection flows are presented as **sheets** (not navigation pushes). This gives full dismissal control, survives tab switches, and creates fresh state each presentation.

```
CaptureTabRootView (owns NavigationStack)
├── CaptureHomeView (manufacturer menu + recent cameras list)
└── .sheet(item: $activeSheet)
    ├── .sony → NavigationStack → SonyConnectFlowView
    ├── .canon → NavigationStack → CanonConnectFlowView
    └── .nikon → NavigationStack → NikonConnectFlowView
```

Each flow is a step machine:

- **Sony:** decision → QR/manual credentials → WiFi join → discovery → select
- **Canon:** hotspot check → discovery → select
- **Nikon:** WiFi check (soft gate) → discovery → select

Both share `CameraDiscoveryScreen` for the scanning UI and `CameraDiscoveryViewModel` for state management.

**Why sheets instead of navigation push:**

- SwiftUI tab switches dismiss pushed views, causing stale state and leaked connections
- Sheets persist across tab switches
- Each sheet presentation creates fresh view tree
- Full dismissal control (swipe-to-dismiss disabled)

### Sheet Lifecycle

| Action                          | What happens                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------ |
| **Done/Back on discovery**      | `cleanupWithTimeout()` → overlay → disconnect → `onCancel()` → sheet dismisses |
| **Select camera**               | `releaseCamera()` → `onSelect` → `onConnected()` → sheet dismisses             |
| **Tab switch while sheet open** | Sheet stays visible — no dismissal, no cleanup needed                          |
| **Swipe-to-dismiss**            | Blocked (`.interactiveDismissDisabled(true)`)                                  |

**SwiftUI single-sheet rule:** Only one `.sheet` modifier per view works. We use `.sheet(item:)` with an `ActiveSheet` enum to support both Sony and Canon sheets from the same view.
**Note:** Nikon is wired into the same enum-based sheet router.

---

## Key Components

### Views

| View                      | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `CaptureTabRootView`      | Capture tab root, owns sheet presentation for connection flows          |
| `CaptureHomeView`         | Manufacturer menu + recent cameras (Sony/Canon/Nikon sections)          |
| `SonyConnectFlowView`     | Sony connection step machine (decision → credentials → join → discover) |
| `CanonConnectFlowView`    | Canon connection step machine (hotspot check → discover)                |
| `NikonConnectFlowView`    | Nikon connection step machine (WiFi check → discover)                   |
| `CameraDiscoveryScreen`   | Shared scanning UI (scanning/found/timedOut/needsNetworkHelp states)    |
| `CaptureSessionSheetView` | Active capture session with photo list                                  |
| `CaptureStatusBarView`    | Inline status bar during active session                                 |
| `CameraRow`               | Reusable camera row for discovery lists                                 |
| `PhotoListRow`            | Photo row for capture session lists                                     |

### ViewModels

| ViewModel                  | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `CameraDiscoveryViewModel` | Drives discovery UI state, delegates scanning to PTPIPScanner |
| `SonyWiFiJoinViewModel`    | Manages NEHotspotConfiguration WiFi join for Sony             |

### Models

| Model                      | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `DiscoveredCamera`         | Camera found during scan (holds prepared PTP/IP session) |
| `ActiveCamera`             | Camera with active session ready for transfer            |
| `CapturedPhoto`            | Single transferred photo with metadata                   |
| `APCameraConnectionRecord` | Persisted recent camera for reconnect                    |

### Stores

| Store                     | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `CaptureSessionStore`     | Owns active TransferSession, drives session UI state |
| `APCameraConnectionStore` | Persists recent camera records (UserDefaults)        |

### Services

| Service               | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `PTPIPScanner`        | Parallel IP scan with full PTP/IP handshake validation |
| `PTPIPSession`        | Protocol session (command + event channels)            |
| `CameraEventSource`   | Protocol for vendor-specific event monitoring          |
| `CanonEventSource`    | Canon polling (0x9116) with adaptive 50-200ms          |
| `StandardEventSource` | Push events for Sony                                   |
| `NikonEventSource`    | Nikon polling (0x90C7) with adaptive 50-200ms          |

---

## Data Ownership

```
CaptureTabRootView
    ├── activeSheet: ActiveSheet?             // Which connection flow is open
    ├── recentSony/Canon: [APCameraConnectionRecord]
    │
    └── sessionStore: CaptureSessionStore     // Owns the active session
            └── transferSession: TransferSession?
                    ├── camera: ActiveCamera
                    │       └── session: PTPIPSession
                    │               ├── commandConnection
                    │               ├── eventConnection
                    │               └── eventSource: CameraEventSource
                    ├── photos: [CapturedPhoto]
                    └── skippedRawCount: Int

(Inside each sheet)
SonyConnectFlowView / CanonConnectFlowView
    └── CameraDiscoveryScreen
            └── CameraDiscoveryViewModel
                    ├── cameras: [DiscoveredCamera]
                    ├── state: DiscoveryUIState
                    └── scanner: PTPIPScanner
```

**Ownership Rules:**

1. `PTPIPScanner` creates `DiscoveredCamera` during scan (owns prepared session)
2. `CameraDiscoveryViewModel` holds discovered cameras list
3. On select: `releaseCamera()` removes from VM list so cleanup won't kill it
4. Parent wraps in `ActiveCamera` → `CaptureSessionStore.start()` creates `TransferSession`
5. On dismiss: `cleanupWithTimeout()` disconnects any remaining cameras

---

## Network Scanning (PTPIPScanner)

### Scanner API

| Method                  | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `scan(targets:config:)` | Start parallel IP scan with PTP/IP handshake |
| `stop(timeout:)`        | Cancel scan, abandon after timeout           |

### Scan Stages (per IP)

```
1. TCP Connect (Command Channel)     → NWConnection to port 15740
2. Init Command Handshake            → InitCommandRequest(GUID, hostname) → InitCommandAck
3. TCP Connect (Event Channel)       → Second NWConnection to port 15740
4. Init Event Handshake              → InitEventRequest(connectionNumber) → InitEventAck
5. Prepare Session                   → PTPIPSession ready for use
```

### Cancellation Behavior

```
[Start] → [TCP Connect] → [Init Handshake] → [Prepare Session] → [Complete]
   │            │               │                   │                │
   ▼            ▼               ▼                   ▼                ▼
Cancel:     Cancel:         Cancel:            COMMIT POINT:    Already done:
return nil  cleanup         cleanup            finish & return  RETURN SUCCESS
            return nil      return nil         (don't discard)  (valuable!)
```

**Key principle:** Once session preparation starts, we COMPLETE it even if cancelled. A prepared session is valuable.

### Two-Layer Retry Strategy

#### Layer 1: Scan Waves (Network Timing)

| Parameter   | Value | Purpose                             |
| ----------- | ----- | ----------------------------------- |
| Max waves   | 3     | Full IP range scans                 |
| Wave delay  | 3s    | Wait between waves                  |
| Cancellable | Yes   | Between waves and during wave delay |

#### Layer 2: Per-IP Retry (PTP/IP Timing)

| Parameter   | Value | Purpose                            |
| ----------- | ----- | ---------------------------------- |
| Max retries | 3     | TCP connection attempts per IP     |
| Retry delay | 0.5s  | Wait between retry attempts        |
| Cancellable | Yes   | Before each retry and during delay |

#### Error Classification

| Error Code     | Action    | Reason                                   |
| -------------- | --------- | ---------------------------------------- |
| `ECONNREFUSED` | Retry     | Port not listening yet (camera starting) |
| `ETIMEDOUT`    | Retry     | Slow response (camera busy)              |
| `EHOSTUNREACH` | Fail fast | No device at this IP                     |
| `ENETUNREACH`  | Fail fast | Wrong network/subnet                     |
| Timeout        | Fail fast | No response within perIPTimeout          |

### Selection Flow

```
User taps camera in CameraDiscoveryScreen
       │
       ├── 1. Cancel timeout task
       ├── 2. releaseCamera(camera)           ← Remove from VM list (cleanup won't kill it)
       └── 3. onSelect callback → parent flow
                  └── onConnected(activeCamera) → CaptureSessionStore.start()
                       └── sheet dismisses
```

### Cleanup Flow (Done/Back)

```
User taps Done
       │
       ├── 1. cleanupWithTimeout(4s)          ← Race: cleanup vs timeout
       │          ├── scanner.stop()
       │          └── camera.disconnect() (for each remaining camera)
       │
       ├── 2. Overlay shown during cleanup
       └── 3. onBack callback → sheet dismisses
```

### Timeout Race Pattern

`withTaskGroup` waits for ALL child tasks before returning, even after `cancelAll()`. This caused cleanup to hang when NWConnections were slow to drain.

**Fix:** Use `withCheckedContinuation` + `OnceFlag` pattern:

```swift
let once = OnceFlag()
await withCheckedContinuation { continuation in
    Task { await work(); if once.claim() { continuation.resume() } }
    Task { try? await Task.sleep(...); if once.claim() { continuation.resume() } }
}
```

First task to finish claims the flag and resumes. The other keeps running in the background but can't resume again. Unlike `withTaskGroup`, this truly abandons slow work after timeout.

Used in: `PTPIPScanner.stop()`, `CameraDiscoveryViewModel.cleanupWithTimeout()`

---

## Session Disconnect Sequence

**Critical:** Order matters to prevent hanging on network I/O during disconnect.

```
TransferSession.end()
       │
       ├── 1. await camera.disconnect()
       │          │
       │          └── PTPIPSession.disconnect()
       │                     │
       │                     ├── 1. eventSource.cleanup() ← vendor-specific cleanup
       │                     │          ├── stopMonitoring() ← stops polling task
       │                     │          └── Canon: drain events + SetEventMode(0)
       │                     ├── 2. sendCloseSession() (after vendor cleanup)
       │                     └── 3. cancel TCP connections
       └── 2. photos.removeAll()
```

### Canon Graceful Disconnect

Canon cameras require additional cleanup steps per gphoto2lib's `camera_exit()` pattern:

```
CanonEventSource.cleanup()
       │
       ├── 1. drainPendingEvents()     ← Poll GetEvent once to clear queue
       ├── 2. disableEventMode()       ← Send SetEventMode(0) to camera
       ├── 3. stopMonitoring()         ← Stop polling loop
       └── 4. Clear references         ← Release connections
```

---

## Photo Transfer

### Multi-Vendor Event Architecture

```
PTPIPSession
    └── eventSource: CameraEventSource (protocol)
           ├── CanonEventSource   → Polling (0x9116), adaptive 50-200ms
           ├── NikonEventSource   → Polling (0x90C7), adaptive 50-200ms
           └── StandardEventSource → Push events (Sony vendor event 0xC201)
```

### Canon Event Polling (Adaptive)

| Parameter               | Value           |
| ----------------------- | --------------- |
| Start interval          | 50ms            |
| Increase per idle cycle | +50ms           |
| Maximum interval        | 200ms           |
| Reset on event found    | Immediate (0ms) |

### Sony In-Memory Capture

Sony ILCE cameras report captures via vendor events and a fixed in-memory object handle:

- Vendor event `0xC201` as ObjectAdded
- In-memory handle `0xFFFFC001` with per-capture logical IDs
- Readiness gating on `objectInMemory (0xD215) >= 0x8000` via `GetAllDevicePropData (0x9209)`
- Download via `GetPartialObject (0x101B)` using `compressedSize` from `GetObjectInfo`
- Command-channel serialization via `PTPIPCommandQueue`

### RAW File Filtering

Only JPEGs are downloaded. RAW files (CR2, CR3, NEF, ARW) are detected via `GetObjectInfo` and skipped.

### Transfer Flow

```
Camera stores JPEG
       │
       │  PTP Event (vendor-specific)
       ▼
┌─────────────────────────────────────────────────────┐
│ CameraEventSource (Canon/Nikon/Sony)                 │
│   1. Detect photo (polling or push event)           │
│   2. GetObjectInfo → Check if JPEG or RAW           │
│   3. If RAW: delegate.didSkipRawFile() → skip       │
│   4. If JPEG: downloadPhoto() via PhotoOperations   │
│   5. delegate.eventSource(didDetectPhoto:)          │
└─────────────────────────────────────────────────────┘
       │
       ▼
TransferSession adds photo to @Published photos → UI updates
```

---

## PTP/IP Protocol

### Connection Structure

```
iOS device                                    Camera
  │◀═══════════ Command Channel ═══════════════▶│  TCP port 15740
  │     (PTP commands and responses)             │
  │◀═══════════ Event Channel ═════════════════▶│  TCP port 15740
  │     (Async events / polling)                 │  (separate connection)
```

### Session Lifecycle

```
1. Init Command Handshake
   iOS → InitCommandRequest(GUID, hostname)
   iOS ← InitCommandAck(connectionNumber, cameraName)

2. Init Event Handshake
   iOS → InitEventRequest(connectionNumber)
   iOS ← InitEventAck

3. Open Session
   iOS → OpenSession(sessionID)
   iOS ← Response(OK)

3b. DeviceInfo (vendor refinement)
   iOS → GetDeviceInfo
   iOS ← Data(DeviceInfo)
   iOS: cameraVendor derived from DeviceInfo Manufacturer (fallback: cameraName)

4. Vendor-specific init
    Canon: SetEventMode(1)
    Sony:  Extra handshake 0x920D after SDIO init

5. Photo Detection
    Canon: polling Canon_GetEvent every 50-200ms
    Nikon: polling Nikon_GetEvent every 50-200ms
    Sony:  push events via event channel (0xC201)

6. Photo Download
   Canon: GetObjectInfo → GetObject
   Sony:  GetObjectInfo → GetPartialObject (0x101B)

7. Close Session
   iOS → CloseSession
```

### Protocol Constants

**Canon-specific:**

- `0x9115` - Canon_EOS_SetEventMode
- `0x9116` - Canon_EOS_GetEvent
- `0xC1A7` - ObjectAdded event

**Sony-specific:**

- `0xC201` - Sony vendor ObjectAdded event
- `0xD215` - objectInMemory device property
- `0x9209` - GetAllDevicePropData
- `0x920D` - Sony extra handshake
- `0x101B` - GetPartialObject
- `0xFFFFC001` - In-memory object handle

**Standard PTP:**

- `0x1002` - OpenSession
- `0x1003` - CloseSession
- `0x1008` - GetObjectInfo
- `0x1009` - GetObject
- `0x2001` - Response OK

**Nikon-specific:**

- `0x90C7` - Nikon_GetEvent (polling)
- Event payload may include standard PTP events like `0x4002` (ObjectAdded) and `0x400D` (CaptureComplete)
- Some Nikon bodies/modes may also emit Nikon-specific `0xC101` (ObjectAddedInSDRAM)

### Canon Compatibility

Validated Canon PTP/IP protocol across generations (EOS 80D 2016 vs R6 Mark II 2022): **byte-for-byte identical** protocol.

All Canon cameras supporting "EOS Utility WiFi connection" use this standardized protocol:

- R-series (15 models): R1, R3, R5, R5 II, R6 III, R6 II, R6, R7, R8, R10, R50, R100, RP
- DSLRs with WiFi (18+ models): 90D, 80D, 77D, 70D, 6D Mark II, 6D, 5D Mark IV
- M-series (10 models): M6 II, M50 II, M50, M200, M100, M10, M5, M6, M3

---

## Threading Model

- **@MainActor**: All UI updates, stores, view models, PTPIPScanner
- **Cooperative Pool**: Network I/O within TaskGroup (scan waves)
- **NWConnection**: Managed by Network framework on background queue

---

## File Structure

```
SabaiPicsStudio/
├── SabaiPicsStudioApp.swift
│
├── Views/
│   ├── MainTabView.swift
│   ├── RootFlowView.swift
│   ├── Capture/
│   │   ├── CaptureTabRootView.swift        # Capture tab orchestrator
│   │   ├── CaptureHomeView.swift           # Manufacturer menu + recent cameras
│   │   ├── CaptureSessionSheetView.swift   # Active session photo list
│   │   └── CaptureStatusBarView.swift      # Inline status bar
│   ├── Sony/
│   │   ├── SonyConnectFlowView.swift       # Sony connection step machine
│   │   ├── SonyWiFiOnboardingView.swift    # QR/manual credential entry
│   │   ├── SonyWiFiJoinStatusView.swift    # WiFi join progress
│   │   └── SonyConnectivityGuideView.swift # Setup instructions
│   ├── Canon/
│   │   ├── CanonConnectFlowView.swift      # Canon connection step machine
│   │   └── CanonHotspotSetupView.swift     # Hotspot check with soft-gate
│   ├── Nikon/
│   │   ├── NikonConnectFlowView.swift      # Nikon connection step machine
│   │   └── NikonHotspotSetupView.swift     # WiFi setup instructions (soft-gate)
│   └── Shared/
│       ├── CameraDiscoveryScreen.swift     # Shared discovery UI
│       ├── CameraRow.swift                 # Camera row for discovery lists
│       ├── PhotoListRow.swift              # Photo row for session lists
│       └── AppBackToolbarButton.swift      # Reusable toolbar button
│
├── ViewModels/
│   ├── Shared/CameraDiscoveryViewModel.swift  # Discovery state + scanner delegation
│   ├── Sony/SonyWiFiJoinViewModel.swift       # NEHotspotConfiguration join
│   └── Network/WiFiJoinViewModel.swift        # WiFi join helpers
│
├── Stores/
│   ├── CaptureSessionStore.swift           # Owns TransferSession
│   └── TransferSession.swift               # Active photo transfer
│
├── Services/
│   ├── Discovery/
│   │   ├── PTPIPScanner.swift              # PTP/IP handshake scanner
│   │   └── DiscoveryUIState.swift          # UI state enum
│   │   └── NikonHotspotDiscovery.swift      # Nikon scan target heuristics
│   ├── PTPIPSession.swift                  # Protocol session
│   ├── PTPIPPacket.swift                   # Packet encoding/decoding
│   ├── PTPIPCommand.swift                  # Command queue
│   ├── CameraEventSource.swift             # Event source protocol
│   ├── CanonEventSource.swift              # Canon polling
│   ├── NikonEventSource.swift              # Nikon polling
│   ├── StandardEventSource.swift           # Sony push events
│   ├── APCameraConnectionStore.swift       # Persisted recent cameras
│   └── WiFiNetworkInfo.swift               # Network helpers
│
├── Models/
│   ├── CameraManufacturer.swift
│   ├── DiscoveredCamera.swift
│   ├── ActiveCamera.swift
│   └── CapturedPhoto.swift
│
└── Theme/
    ├── Colors.swift                        # Color.Theme.* extension
    └── ButtonStyles.swift                  # .compact, .primary, .secondary, etc.
```

---

## Key Design Decisions

| Decision                                    | Rationale                                                           |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Sheet-based connection flows                | Survives tab switches, full dismissal control, fresh state          |
| Single `.sheet(item:)` with enum            | SwiftUI only supports one `.sheet` per view                         |
| Session prepared during scan (COMMIT POINT) | Instant connection when user selects                                |
| `releaseCamera()` before handing off        | Cleanup won't disconnect the selected camera                        |
| `withCheckedContinuation` timeout race      | `withTaskGroup` blocks on slow tasks even after `cancelAll()`       |
| Adaptive Canon polling (50-200ms)           | Fast response, battery-efficient idle                               |
| Sony in-memory gating (`0xD215`)            | Prevents download before camera is ready                            |
| PTPIPScanner replaces NetworkScannerService | Full PTP/IP handshake validation during scan, not just TCP probe    |
| Shared CameraDiscoveryScreen                | Same discovery UX for Sony/Canon/Nikon                              |
| Vendor detection via GetDeviceInfo          | Camera name may omit manufacturer (e.g. Nikon Z6 reports `Z_6_...`) |
