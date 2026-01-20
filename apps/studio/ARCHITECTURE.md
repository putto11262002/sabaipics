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

| View | Purpose |
|------|---------|
| `ContentView` | Root view with state-driven navigation |
| `ManufacturerSelectionView` | Camera brand selection (Canon, Nikon, Sony) |
| `HotspotSetupView` | Instructions for enabling Personal Hotspot |
| `CameraDiscoveryView` | Unified scanning UI - cameras selectable during scan |
| `WiFiSetupView` | Manual IP entry fallback |
| `LiveCaptureView` | Main capture screen showing transferred photos |

### Models

| Model | Purpose |
|-------|---------|
| `DiscoveredCamera` | Camera found during scan (holds prepared session) |
| `ActiveCamera` | Camera with active session ready for transfer |
| `TransferSession` | Manages photo transfer, owns ActiveCamera |
| `CapturedPhoto` | Single transferred photo with metadata |

### Services

| Service | Purpose |
|---------|---------|
| `NetworkScannerService` | Parallel IP scan with PTP/IP handshake |
| `PTPIPSession` | Protocol session (command + event channels) |

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
            │               └── eventConnection
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

| Function | Purpose |
|----------|---------|
| `startScan()` | Start parallel IP scan (172.20.10.2-20) |
| `stopScan()` | Cancel in-flight tasks only. Does NOT disconnect. |
| `disconnectOtherCameras(except:)` | Disconnect all except selected |
| `disconnectAllCameras()` | Disconnect all (when navigating away) |
| `cleanup()` | stopScan() + disconnectAllCameras() + reset |

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

---

## Photo Transfer

### Canon Event Polling (Adaptive)

Canon cameras require polling (no push events). Uses libgphoto2's adaptive pattern:

| Parameter | Value |
|-----------|-------|
| Start interval | 50ms |
| Increase per idle cycle | +50ms |
| Maximum interval | 200ms |
| Reset on event found | Immediate (0ms) |

```swift
private func canonPollingLoop() async {
    while isConnected {
        let foundEvents = try await pollCanonEvent()

        if foundEvents {
            pollInterval = minPollInterval  // Reset to 50ms
            continue                        // Poll again immediately
        } else {
            try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
            pollInterval = min(pollInterval + 0.05, maxPollInterval)
        }
    }
}
```

### RAW File Filtering

Only JPEGs are downloaded. RAW files (CR2, CR3, NEF, ARW) are detected via `GetObjectInfo` and skipped.

- `TransferSession.skippedRawCount` tracks count
- Dismissible warning banner shown in LiveCaptureView
- No RAW data transferred (saves bandwidth/time)

### Transfer Flow

```
Camera stores JPEG
       │
       │  PTP Event: ObjectAdded (objectHandle)
       ▼
┌─────────────────────────────────────────────────────┐
│ PTPIPSession.pollCanonEvent()                        │
│   1. GetObjectInfo → Check if JPEG or RAW           │
│   2. If RAW: delegate.didSkipRawFile() → skip       │
│   3. If JPEG: GetObject → download                  │
│   4. delegate.didDownloadPhoto(data, handle)        │
└─────────────────────────────────────────────────────┘
       │
       ▼
TransferSession adds photo to @Published photos array
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
│   └── PTPIPCommand.swift
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Session prepared during scan | Instant connection when user selects |
| Separate stopScan() from disconnect | No accidental disconnects from timeout |
| Cancellation-safe with COMMIT POINT | Valuable sessions preserved |
| Adaptive polling (50-200ms) | Fast response, battery-efficient idle |
| Direct @ObservedObject in LiveCaptureView | Immediate photo list updates |
| Local @State for alerts | Simpler, no cleanup needed |
| RAW file filtering | Only transfer JPEGs (faster, practical) |
| @MainActor protocol delegate | Safe UI updates from callbacks |
