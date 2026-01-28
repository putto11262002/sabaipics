# SabaiPics Studio - iOS Architecture

## Overview

iPad app for professional photographers to wirelessly transfer photos from Canon cameras via PTP/IP protocol over WiFi.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         iPad (SabaiPics Studio)                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   SwiftUI   │───▶│    App      │───▶│    Network/Protocol     │  │
│  │    Views    │    │ Coordinator │    │       Services          │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ WiFi (PTP/IP over TCP port 15740)
                              ▼
                    ┌─────────────────┐
                    │  Canon Camera   │
                    └─────────────────┘
```

---

## App State Machine

```
┌────────────────────┐
│ manufacturerSelection │◀──────────────────────────────────────┐
└──────────┬─────────┘                                          │
           │ selectManufacturer()                               │
           ▼                                                    │
┌────────────────────┐                                          │
│   hotspotSetup     │ (if no hotspot detected)                 │
└──────────┬─────────┘                                          │
           │ proceedToDiscovery()                               │
           ▼                                                    │
┌────────────────────┐     skipToManualEntry()    ┌───────────────────┐
│    discovering     │───────────────────────────▶│   manualIPEntry   │
└──────────┬─────────┘                            └─────────┬─────────┘
           │ selectDiscoveredCamera()                       │ connectManualIP()
           ▼                                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                          transferring                               │
│                    (TransferSession active)                         │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ disconnect
                                   ▼
                        Back to manufacturerSelection
```

```swift
enum AppState: Equatable {
    case manufacturerSelection    // Initial state
    case hotspotSetup            // Hotspot instructions
    case discovering             // Scanning for cameras
    case manualIPEntry           // Manual IP input
    case connecting(ip: String)  // Connecting to specific IP
    case transferring            // Active photo transfer
    case error(String)           // Error with message
}
```

---

## Key Components

### Views

| View                        | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `ContentView`               | Root view with state-driven navigation               |
| `ManufacturerSelectionView` | Camera brand selection (Canon, Nikon, Sony)          |
| `HotspotSetupView`          | Instructions for enabling Personal Hotspot           |
| `CameraDiscoveryView`       | Unified scanning UI - cameras selectable during scan |
| `WiFiSetupView`             | Manual IP entry fallback                             |
| `LiveCaptureView`           | Main capture screen showing transferred photos       |

### Models

| Model              | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `DiscoveredCamera` | Camera found during scan (holds prepared session) |
| `ActiveCamera`     | Camera with active session ready for transfer     |
| `TransferSession`  | Manages photo transfer, owns ActiveCamera         |
| `CapturedPhoto`    | Single transferred photo with metadata            |

### Services

| Service                 | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `NetworkScannerService` | Parallel IP scan with PTP/IP handshake        |
| `PTPIPSession`          | Protocol session (command + event channels)   |
| `CameraEventSource`     | Protocol for vendor-specific event monitoring |
| `CanonEventSource`      | Canon polling (0x9116) with adaptive 50-200ms |
| `StandardEventSource`   | Push events for Sony/Fuji/Olympus             |
| `NikonEventSource`      | Nikon polling stub (TODO: 0x90C7)             |

---

## Data Ownership

```
AppCoordinator
    ├── appState: AppState
    ├── selectedManufacturer: CameraManufacturer?
    ├── discoveredCameras: [DiscoveredCamera]     // During scanning
    │
    └── transferSession: TransferSession?          // During transfer
            ├── camera: ActiveCamera
            │       └── session: PTPIPSession
            │               ├── commandConnection
            │               ├── eventConnection
            │               └── eventSource: CameraEventSource
            │                       ├── CanonEventSource (polling)
            │                       ├── NikonEventSource (stub)
            │                       └── StandardEventSource (push)
            │
            ├── photos: [CapturedPhoto]
            └── skippedRawCount: Int
```

**Ownership Rules:**

1. `DiscoveredCamera` holds prepared session during scanning
2. `ActiveCamera` takes ownership when user selects (session extracted)
3. `TransferSession` owns ActiveCamera and all photos
4. On disconnect: `TransferSession.end()` → `ActiveCamera.disconnect()` → `PTPIPSession.disconnect()`

---

## Network Scanning

### Scanner Functions

| Function                          | Purpose                                           |
| --------------------------------- | ------------------------------------------------- |
| `startScan()`                     | Start parallel IP scan (172.20.10.2-20)           |
| `stopScan()`                      | Cancel in-flight tasks only. Does NOT disconnect. |
| `disconnectOtherCameras(except:)` | Disconnect all except selected                    |
| `disconnectAllCameras()`          | Disconnect all (when navigating away)             |
| `cleanup()`                       | stopScan() + disconnectAllCameras() + reset       |

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

### Two-Layer Retry Strategy (SAB-37)

Camera discovery uses a two-layer retry strategy to handle cameras that join the network late or have slow PTP/IP startup.

#### Layer 1: Scan Waves (Network Timing)

Handles cameras that join the Personal Hotspot network after scanning starts.

| Parameter   | Value | Purpose                             |
| ----------- | ----- | ----------------------------------- |
| Max waves   | 3     | Full IP range scans                 |
| Wave delay  | 3s    | Wait between waves                  |
| Early exit  | Yes   | Stop waves if camera found          |
| Cancellable | Yes   | Between waves and during wave delay |

```
Wave 1: Scan .2-.20 in parallel
   ↓ (no camera found)
   3s delay
   ↓
Wave 2: Scan .2-.20 in parallel
   ↓ (camera found!)
   Stop early - return results
```

#### Layer 2: Per-IP Retry (PTP/IP Timing)

Handles cameras where the PTP/IP listener isn't ready immediately after network connection.

| Parameter   | Value | Purpose                            |
| ----------- | ----- | ---------------------------------- |
| Max retries | 3     | TCP connection attempts per IP     |
| Retry delay | 0.5s  | Wait between retry attempts        |
| Cancellable | Yes   | Before each retry and during delay |

#### Error Classification

Not all TCP errors are worth retrying. The scanner classifies errors:

| Error Code     | Action    | Reason                                   |
| -------------- | --------- | ---------------------------------------- |
| `ECONNREFUSED` | Retry     | Port not listening yet (camera starting) |
| `ETIMEDOUT`    | Retry     | Slow response (camera busy)              |
| `EHOSTUNREACH` | Fail fast | No device at this IP                     |
| `ENETUNREACH`  | Fail fast | Wrong network/subnet                     |
| Timeout        | Fail fast | No response within perIPTimeout          |

#### Timing Expectations

| Scenario                     | Expected Time |
| ---------------------------- | ------------- |
| Camera ready immediately     | ~3s           |
| Camera needs TCP retry       | ~4-5s         |
| Camera joins during wave 2   | ~6-9s         |
| Camera joins during wave 3   | ~9-12s        |
| No camera found (worst case) | ~15s          |

#### Cancellation Points

Scanning is cancellable at any moment:

1. Before starting each wave
2. Before each IP scan within a wave
3. During TCP retry delay (0.5s)
4. During wave delay (3s)

Uses `guard !Task.isCancelled else { return }` pattern throughout.

#### Connection Timeout Implementation

TCP connection timeout uses a polling-based approach for reliability:

```
waitForConnection(timeout: 2s):
  1. Set up NWConnection state handler (runs on background queue)
  2. Poll every 50ms to check if connection completed
  3. If timeout reached, throw NetworkScannerError.timeout
```

**Why polling instead of TaskGroup?**

- TaskGroup-based timeout had reliability issues (tasks not running in parallel correctly)
- Polling guarantees timeout fires after exactly 2s
- Background queue for NWConnection avoids main thread deadlock

| Parameter          | Value                           |
| ------------------ | ------------------------------- |
| Connection timeout | 2s                              |
| Poll interval      | 50ms                            |
| Network queue      | Background (QoS: userInitiated) |

### Selection Flow

```
User taps camera
       │
       ├── 1. Cancel timeout task
       ├── 2. scanner.stopScan()              ← Just cancels, sessions stay alive
       └── 3. coordinator.selectDiscoveredCamera()
                  ├── 4. Extract session from selected camera
                  ├── 5. Disconnect OTHER cameras
                  └── 6. Create TransferSession → .transferring
```

### Back Navigation Flow

```
User taps Back
       │
       ├── 1. Cancel timeout task
       ├── 2. scanner.cleanup()               ← Stops scan AND disconnects ALL
       └── 3. coordinator.backToManufacturerSelection()
```

### Session Disconnect Sequence

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

**Cancellation Pattern:**

- Network calls wrapped in `withTaskCancellationHandler` (CanonEventSource)
- `connection.cancel()` called BEFORE awaiting task (interrupts pending I/O)
- Tasks awaited to ensure complete cleanup before returning

**Without this pattern:** Tasks hang on `receive()` waiting for timeout, causing multiple disconnect attempts (SAB-41).

### Canon Graceful Disconnect (SAB-57)

Canon cameras require additional cleanup steps per gphoto2lib's `camera_exit()` pattern:

```
CanonEventSource.cleanup()
       │
       ├── 1. drainPendingEvents()     ← Poll GetEvent once to clear queue
       │          └── Send Canon_EOS_GetEvent, discard response
       │
       ├── 2. disableEventMode()       ← Tell camera we're done monitoring
       │          └── Send SetEventMode(0)
       │
       ├── 3. stopMonitoring()         ← Stop polling loop
       │
       └── 4. Clear references         ← Release connections
```

**Why this matters:**

- Without `SetEventMode(0)`, camera may continue trying to report events
- Without draining events, pending events may cause state inconsistency
- Matches gphoto2lib behavior for proper PTP spec compliance

---

## Photo Transfer

### Multi-Vendor Event Architecture

```
PTPIPSession
    └── eventSource: CameraEventSource (protocol)
           ├── CanonEventSource   → Polling (0x9116), adaptive 50-200ms
           ├── NikonEventSource   → Polling stub (TODO: 0x90C7)
           └── StandardEventSource → Push events (Sony/Fuji/Olympus)
```

### Canon Event Polling (Adaptive)

Canon cameras require polling (no push events). Uses libgphoto2's adaptive pattern:

| Parameter               | Value           |
| ----------------------- | --------------- |
| Start interval          | 50ms            |
| Increase per idle cycle | +50ms           |
| Maximum interval        | 200ms           |
| Reset on event found    | Immediate (0ms) |

Implemented in `CanonEventSource.pollingLoop()`.

### RAW File Filtering

Only JPEGs are downloaded. RAW files (CR2, CR3, NEF, ARW) are detected via `GetObjectInfo` and skipped.

- `TransferSession.skippedRawCount` tracks count
- Dismissible warning banner shown in LiveCaptureView
- No RAW data transferred (saves bandwidth/time)

### Transfer Flow

```
Camera stores JPEG
       │
       │  PTP Event (vendor-specific)
       ▼
┌─────────────────────────────────────────────────────┐
│ CameraEventSource (Canon/Nikon/Standard)            │
│   1. Detect photo (polling or push event)           │
│   2. GetObjectInfo → Check if JPEG or RAW           │
│   3. If RAW: delegate.didSkipRawFile() → skip       │
│   4. If JPEG: downloadPhoto() via PhotoOperations   │
│   5. delegate.eventSource(didDetectPhoto:)          │
└─────────────────────────────────────────────────────┘
       │
       ▼
PTPIPSession → TransferSession adds photo to @Published photos
       │
       ▼
LiveCaptureView re-renders (direct @ObservedObject observation)
```

---

## UI Observation Pattern

### LiveCaptureView

Uses direct `@ObservedObject` observation of `TransferSession` for immediate photo updates:

```swift
struct LiveCaptureView: View {
    @ObservedObject var session: TransferSession  // Direct observation
    let onDisconnected: () -> Void                // Navigation callback

    @State private var showDisconnectAlert = false  // Local UI state

    var body: some View {
        List(session.photos) { photo in ... }  // Updates immediately
    }
}
```

**Key points:**

- `@ObservedObject` directly observes `TransferSession.photos`
- Alert state is local (`@State`), not in coordinator
- Navigation via callback, not coordinator method

---

## PTP/IP Protocol

### Connection Structure

```
iPad                                          Camera
  │◀═══════════ Command Channel ═══════════════▶│  TCP port 15740
  │     (PTP commands and responses)             │
  │◀═══════════ Event Channel ═════════════════▶│  TCP port 15740
  │     (Async events / polling for Canon)       │  (separate connection)
```

### Session Lifecycle

```
1. Init Command Handshake
   iPad → InitCommandRequest(GUID, hostname)
   iPad ← InitCommandAck(connectionNumber, cameraName)

2. Init Event Handshake
   iPad → InitEventRequest(connectionNumber)
   iPad ← InitEventAck

3. Open Session
   iPad → OpenSession(sessionID)
   iPad ← Response(OK)

4. Canon-specific: Enable Events
   iPad → SetEventMode(1)
   iPad ← Response(OK)

5. Photo Detection (Canon polling every 50-200ms)
   iPad → Canon_GetEvent
   iPad ← ObjectHandles (if new photos)

6. Photo Download
   iPad → GetObjectInfo(handle) → Check format (skip RAW)
   iPad → GetObject(handle)
   iPad ← JPEG data

7. Close Session
   iPad → CloseSession
```

---

## Threading Model

- **@MainActor**: All UI updates, AppCoordinator, TransferSession, NetworkScannerService
- **Cooperative Pool**: Network I/O within TaskGroup
- **NWConnection**: Managed by Network framework

```swift
// Scanner runs parallel tasks, updates UI on main actor
await withTaskGroup(of: DiscoveredCamera?.self) { group in
    for ip in scanRange {
        group.addTask { await self.scanIP(ip) }
    }
    for await result in group {
        if let camera = result {
            discoveredCameras.append(camera)  // Safe - @MainActor
        }
    }
}
```

---

## File Structure

```
SabaiPicsStudio/
├── SabaiPicsStudioApp.swift
├── ContentView.swift
│
├── Views/
│   ├── ManufacturerSelectionView.swift
│   ├── HotspotSetupView.swift
│   ├── CameraDiscoveryView.swift
│   ├── WiFiSetupView.swift
│   └── LiveCaptureView.swift
│
├── Models/
│   ├── AppState.swift
│   ├── CameraManufacturer.swift
│   ├── DiscoveredCamera.swift
│   ├── ActiveCamera.swift
│   └── CapturedPhoto.swift
│
├── Stores/
│   ├── AppCoordinator.swift
│   └── TransferSession.swift
│
├── Services/
│   ├── NetworkScannerService.swift
│   ├── PTPIPSession.swift
│   ├── PTPIPPacket.swift
│   ├── PTPIPCommand.swift
│   ├── PTPIPEventMonitor.swift
│   ├── CameraEventSource.swift      // Protocol
│   ├── CanonEventSource.swift       // Canon polling
│   ├── StandardEventSource.swift    // Sony/Fuji push events
│   └── NikonEventSource.swift       // Nikon stub
```

---

## Key Design Decisions

| Decision                                  | Rationale                               |
| ----------------------------------------- | --------------------------------------- |
| Session prepared during scan              | Instant connection when user selects    |
| Separate stopScan() from disconnect       | No accidental disconnects from timeout  |
| Cancellation-safe with COMMIT POINT       | Valuable sessions preserved             |
| Adaptive polling (50-200ms)               | Fast response, battery-efficient idle   |
| Direct @ObservedObject in LiveCaptureView | Immediate photo list updates            |
| Local @State for alerts                   | Simpler, no cleanup needed              |
| RAW file filtering                        | Only transfer JPEGs (faster, practical) |
| @MainActor protocol delegate              | Safe UI updates from callbacks          |
| CameraEventSource protocol                | Multi-vendor support (Canon/Nikon/Sony) |
| PhotoOperationsProvider protocol          | Decouples event detection from download |
