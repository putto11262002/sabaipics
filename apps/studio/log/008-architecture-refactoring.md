# 008: Architecture Refactoring

**Status**: Planning
**Phase**: 8
**Date**: 2026-01-16

## Overview

Comprehensive refactoring of the iOS app architecture to address:
1. **Prop drilling** - CameraViewModel being passed to every view
2. **Testability** - Cannot test without real camera hardware
3. **God object** - CameraViewModel is 330 lines doing everything

## Current Architecture Issues

### Problem 1: Prop Drilling
```swift
ContentView(viewModel: viewModel)
  └─ WiFiSetupView(viewModel: viewModel)
  └─ LiveCaptureView(viewModel: viewModel)
     └─ Every child view needs viewModel passed down
```

### Problem 2: Cannot Test Without Hardware
- All logic coupled to real WiFiCameraService
- No way to mock camera for testing
- Cannot preview complex UI states easily

### Problem 3: God Object Anti-Pattern
CameraViewModel (330 lines) currently handles:
- Connection state management
- Photo storage and management
- UI state (retry count, permissions, etc.)
- Business logic (deduplication, filtering)
- Service coordination

## Proposed Architecture

### Pattern 1: Environment Object (Eliminate Prop Drilling)
Use SwiftUI's `@EnvironmentObject` to provide stores at app root, accessible anywhere without passing props.

**React Equivalent**: React Context API

```swift
// Root level injection
ContentView()
    .environmentObject(connectionStore)
    .environmentObject(photoStore)

// Any child view can access directly
struct WiFiSetupView: View {
    @EnvironmentObject var connectionStore: ConnectionStore
    // No props needed!
}
```

### Pattern 2: Dependency Injection via Protocols (Testability)
Define protocol for camera service, inject real or mock implementation.

**React Equivalent**: TypeScript interfaces + dependency injection

```swift
protocol CameraServiceProtocol {
    var connectionStatePublisher: Published<ConnectionState>.Publisher { get }
    var photoDownloadedPublisher: PassthroughSubject<(String, Data), Never> { get }
    func connect(ip: String)
    func disconnect()
}

// Real implementation
class WiFiCameraService: CameraServiceProtocol { ... }

// Mock for testing
class MockCameraService: CameraServiceProtocol { ... }
```

### Pattern 3: Feature Stores (Break Down God Object)
Split CameraViewModel into focused stores by domain.

**React Equivalent**: Redux slices / Zustand stores

```swift
// Connection concerns only
class ConnectionStore: ObservableObject {
    @Published var connectionState: ConnectionState
    @Published var connectedIP: String?
    @Published var retryCount: Int

    func connect(ip: String) { ... }
    func disconnect() { ... }
}

// Photo concerns only
class PhotoStore: ObservableObject {
    @Published var photos: [CapturedPhoto]
    @Published var detectedCount: Int

    func addPhoto(filename: String, data: Data) { ... }
    func clearPhotos() { ... }
}

// Coordinator ties stores together
class AppCoordinator: ObservableObject {
    let connectionStore: ConnectionStore
    let photoStore: PhotoStore
}
```

## Critical Architecture Question: Event Loop Serialization

**Q: Does the refactoring maintain serialized access to libgphoto2?**

**A: YES - Serialization is preserved in Objective-C layer.**

### Current Flow (Unchanged by Refactoring)

```
┌─────────────────────────────────────────────────────┐
│ WiFiCameraManager.m (Objective-C)                  │
│ ├─ monitoring_thread (ONE BACKGROUND THREAD)       │
│ │  while (monitoring) {                             │
│ │    // STEP 1: Wait for event (BLOCKS)            │
│ │    ret = gp_camera_wait_for_event(...)           │
│ │                                                    │
│ │    // STEP 2: Add to download queue              │
│ │    if (GP_EVENT_FILE_ADDED) {                    │
│ │      [_downloadQueue addObject:@{...}];          │
│ │      [delegate didDetectNewPhoto:...]; // notify │
│ │    }                                              │
│ │                                                    │
│ │    // STEP 3: Process queue (BLOCKS)             │
│ │    if (_downloadQueue.count > 0) {               │
│ │      data = synchronousDownloadFile(...);        │
│ │      // ↑ calls gp_camera_file_get()            │
│ │      [delegate didDownloadPhoto:data ...];       │
│ │    }                                              │
│ │  }                                                │
│ └─ All libgphoto2 calls on SAME thread            │
└─────────────────────────────────────────────────────┘
           ↓ (delegate callbacks - results only)
┌─────────────────────────────────────────────────────┐
│ WiFiCameraService.swift (PASSIVE RECEIVER)         │
│ ├─ NO download calls from Swift                    │
│ ├─ Only forwards callbacks to Combine publishers   │
│ └─ Refactoring changes THIS layer only             │
└─────────────────────────────────────────────────────┘
```

**Key Points:**
- Event monitoring runs on ONE background thread in Objective-C
- `gp_camera_wait_for_event()` and `gp_camera_file_get()` are SERIALIZED
- No concurrent access to libgphoto2 camera handle
- Swift layer is PASSIVE - only receives callbacks
- **Refactoring does NOT change Objective-C serialization**

### After Refactoring

```
┌─────────────────────────────────────────────────────┐
│ WiFiCameraManager.m (Objective-C)                  │
│ └─ UNCHANGED - same serialized event loop          │
└─────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│ CameraServiceProtocol (Interface)                  │
│ └─ WiFiCameraService implements (wrapper)          │
└─────────────────────────────────────────────────────┘
           ↓ (Combine publishers)
┌─────────────────────────────────────────────────────┐
│ Stores (ConnectionStore, PhotoStore)               │
│ └─ Subscribe to service publishers                  │
└─────────────────────────────────────────────────────┘
           ↓ (@EnvironmentObject)
┌─────────────────────────────────────────────────────┐
│ Views (WiFiSetupView, LiveCaptureView)            │
│ └─ Read from stores, trigger actions                │
└─────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Protocols & Dependency Injection (1.5h)
- [ ] Create `CameraServiceProtocol`
- [ ] Create `MockCameraService` for testing
- [ ] Refactor `WiFiCameraService` to conform to protocol
- [ ] Add protocol-based initializers

### Phase 2: Create Feature Stores (2h)
- [ ] Create `ConnectionStore` (connection state only)
- [ ] Create `PhotoStore` (photos only)
- [ ] Migrate state from CameraViewModel to stores
- [ ] Set up Combine subscriptions to service publishers

### Phase 3: Create AppCoordinator (1h)
- [ ] Create `AppCoordinator` to tie stores together
- [ ] Inject service into coordinator
- [ ] Inject coordinator into app root

### Phase 4: Refactor Views (2h)
- [ ] Refactor `ContentView` to use stores
- [ ] Refactor `WiFiSetupView` to use `@EnvironmentObject`
- [ ] Refactor `LiveCaptureView` to use stores
- [ ] Refactor other views (ConnectingView, ConnectedView, etc.)

### Phase 5: Testing & Cleanup (30min)
- [ ] Create preview examples with MockCameraService
- [ ] Remove deprecated CameraViewModel
- [ ] Verify all flows work
- [ ] Update documentation

**Total Estimated Time**: 7 hours

## Testing Strategy

### Before (Cannot Test)
```swift
// Must have real camera to test
let viewModel = CameraViewModel()
// Uses real WiFiCameraService internally
```

### After (Mockable)
```swift
// Test with mock service
let mockService = MockCameraService()
let connectionStore = ConnectionStore(cameraService: mockService)

// Simulate events
mockService.simulateConnection()
mockService.simulatePhotoDownload(filename: "IMG_001.JPG", data: testData)

// Assert UI state
XCTAssertEqual(connectionStore.connectionState, .connected)
XCTAssertEqual(photoStore.photos.count, 1)
```

## View Dependency Matrix

| View | ConnectionStore | PhotoStore | Props Only |
|------|----------------|------------|------------|
| WiFiSetupView | ✅ | ❌ | ❌ |
| ConnectingView | ✅ | ❌ | ❌ |
| ConnectedView | ✅ | ❌ | ❌ |
| LiveCaptureView | ✅ | ✅ | ❌ |
| ConnectionErrorView | ❌ | ❌ | ✅ (pure) |

## Migration Path

1. Keep CameraViewModel temporarily alongside new stores
2. Migrate views one at a time
3. Verify each view works before moving to next
4. Delete CameraViewModel once all views migrated
5. Commit in small, working increments

## Benefits

### Developer Experience
- ✅ Clear separation of concerns
- ✅ Easier to locate and modify logic
- ✅ Reduced cognitive load (smaller focused files)

### Testing
- ✅ Mock service for unit tests
- ✅ Test business logic without hardware
- ✅ Faster test execution
- ✅ More reliable CI/CD

### Maintainability
- ✅ New features easier to add
- ✅ Less risk of breaking existing features
- ✅ Clearer ownership of responsibilities

### Performance
- ✅ More granular state updates (only affected views re-render)
- ✅ Better SwiftUI optimization opportunities

## Non-Goals

- ❌ Change Objective-C WiFiCameraManager implementation
- ❌ Modify libgphoto2 event monitoring flow
- ❌ Change serialization guarantees
- ❌ Add multi-camera support (single camera for MVP)

## References

- **Current Implementation**: CameraViewModel.swift (330 lines)
- **Event Loop**: WiFiCameraManager.m lines 497-590 (monitoringLoop)
- **React Equivalent Patterns**: Context API, TypeScript interfaces, Redux Toolkit slices
