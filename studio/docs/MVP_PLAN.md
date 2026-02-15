# SabaiPics Studio - MVP Plan

iOS app for professional event photographers to automatically download photos from Canon cameras via WiFi.

## Completed Phases ✅

### Phase 1: GPhoto2 Framework Integration
**Status**: ✅ Complete
**Commit**: `3fbfe89`
- GPhoto2Framework integration (libgphoto2)
- Objective-C bridge (WiFiCameraManager)
- Basic connection scaffolding

### Phase 2: WiFi Connection
**Status**: ✅ Complete
**Commit**: `efd06fa`
- Full GPhoto2 connection implementation
- PTP/IP protocol support for Canon WiFi
- Connection state management
- Error handling and retry logic

### Phase 3: Photo Event Monitoring
**Status**: ✅ Complete
**Commit**: `3aa5e04`
- Background thread event monitoring
- `gp_camera_wait_for_event()` polling
- Photo detection (GP_EVENT_FILE_ADDED)
- Detection counter UI

### Phase 4: Photo Download
**Status**: ✅ Complete
**Commit**: `6384a55`
- Sequential download processing (thread-safe)
- Download queue on monitoring thread
- JPEG filtering (skip RAW files)
- Image data delivery to UI

### Phase 5: Connection UX
**Status**: ✅ Complete
**Commit**: `1a97779`
- Pre-flight local network permission check
- Auto-retry with exponential backoff (3 attempts)
- ConnectingView with retry counter
- ConnectedView success celebration
- Minimum display times (1.5s)

### Phase 6: UI Refinements
**Status**: ✅ Complete
**Commit**: `fbe6103`
- List view with 60x60 thumbnails (replaced grid)
- Toolbar refinements (event name, camera status)
- Photos prepend to top with slide-down animation
- Task-based async/await (replaced DispatchQueue)
- Navigation bar polish

### Phase 7: Session Management
**Status**: ✅ Complete (Not yet committed)
**Log**: TBD - `log/007-session-management.md`
- Disconnect button with confirmation alert
- NavigationView state corruption fix (dismiss before state change)
- Photo clearing on disconnect
- Unexpected disconnect handling
- State reset (idle/searching → idle)
- Task.detached for non-blocking disconnect

## Current Phase 🚧

### Phase 8: Architecture Refactoring
**Status**: 🚧 Planning
**Log**: [`log/008-architecture-refactoring.md`](./log/008-architecture-refactoring.md)
**Estimated**: 7 hours

**Objectives**:
1. Eliminate prop drilling with `@EnvironmentObject`
2. Enable testing without hardware via Dependency Injection
3. Break down CameraViewModel god object into feature stores

**Approach**:
- Pattern 1: Environment Object (SwiftUI Context API)
- Pattern 2: Protocol-based DI for testability
- Pattern 3: Feature stores (ConnectionStore, PhotoStore)

**See detailed plan**: [`log/008-architecture-refactoring.md`](./log/008-architecture-refactoring.md)

## Upcoming Phases 📋

### Phase 9: Photo Upload to Backend
- Upload captured photos to SabaiPics API
- Event association
- Upload queue management
- Retry logic for failed uploads
- Progress tracking

### Phase 10: Background Processing
- Continue downloads when app backgrounded
- Upload photos in background
- Local persistence (PhotoKit/File system)
- Crash recovery

### Phase 11: Production Polish
- App icon and launch screen
- Error message refinements
- Loading state polish
- Haptic feedback
- Dark mode support
- iPad Pro optimization

## Technical Stack

- **Platform**: iOS 16.6+, Swift 5, SwiftUI
- **Camera Protocol**: PTP/IP via libgphoto2
- **Concurrency**: Task/async-await, Combine
- **Architecture**: MVVM → Feature Stores (Phase 8)
- **Testing**: XCTest (post Phase 8)

## Key Constraints

1. **Single camera connection** - MVP supports one camera at a time
2. **Serialized libgphoto2 access** - All camera operations on monitoring thread
3. **WiFi only** - USB disabled for MVP
4. **JPEG only** - Skip RAW files for fast transfer
5. **Sequential downloads** - No concurrent downloads (libgphoto2 limitation)

## Links

- **Logs**: [`./log/`](./log/)
- **Vendor**: GPhoto2Framework (custom build)
- **Main Files**:
  - `CameraViewModel.swift` (330 lines - to be refactored in Phase 8)
  - `WiFiCameraService.swift` (Swift wrapper)
  - `WiFiCameraManager.m` (Objective-C bridge, event loop)
  - `LiveCaptureView.swift` (Main capture UI)
  - `WiFiSetupView.swift` (Connection setup)
