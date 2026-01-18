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

---

## Phase 4: View Refactoring - COMPLETED ✅
**Date**: 2026-01-18
**Status**: Complete
**Build Status**: ✅ BUILD SUCCEEDED

### Objective
Refactor all views to use `@EnvironmentObject` instead of prop drilling, eliminating the need to pass `CameraViewModel` down the component tree.

### Changes Made

#### 1. App Root - SabaiPicsStudioApp.swift ✅
**What Changed**: Inject AppCoordinator at app entry point
```swift
@main
struct SabaiPicsStudioApp: App {
    @StateObject private var coordinator = AppCoordinator()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(coordinator)
                .environmentObject(coordinator.connectionStore)
                .environmentObject(coordinator.photoStore)
        }
    }
}
```

**Before**: No coordinator, views created own viewModel
**After**: Single coordinator instance provided to all views via environment

---

#### 2. ContentView.swift ✅
**What Changed**: Use coordinator for app-level routing instead of viewModel

**Before**:
```swift
struct ContentView: View {
    @StateObject private var viewModel = CameraViewModel()
    
    var body: some View {
        switch viewModel.appState {
        case .idle:
            WiFiSetupView(viewModel: viewModel)  // Prop drilling
        case .connecting:
            ConnectingView(ipAddress: viewModel.currentIP ?? "...", retryCount: viewModel.retryCount)
        case .connected:
            ConnectedView(cameraModel: "Canon EOS", ipAddress: viewModel.currentIP ?? "", shouldDismiss: $viewModel.shouldDismissConnected)
        case .capturing:
            LiveCaptureView(viewModel: viewModel)
        case .error(let message):
            ConnectionErrorView(errorMessage: message, onTryAgain: { ... })
        }
    }
}
```

**After**:
```swift
struct ContentView: View {
    @EnvironmentObject var coordinator: AppCoordinator
    
    var body: some View {
        switch coordinator.appState {
        case .idle:
            WiFiSetupView()  // No props!
        case .connecting:
            ConnectingView()  // Gets data from environment
        case .connected:
            ConnectedView()  // Auto-transitions via coordinator
        case .capturing:
            LiveCaptureView()  // Uses both stores
        case .error(let message):
            ConnectionErrorView(errorMessage: message)
        }
    }
}
```

**Benefits**:
- ✅ No more prop drilling
- ✅ Views are self-contained
- ✅ Easier to test individual views
- ✅ Preview updated to inject coordinator

---

#### 3. WiFiSetupView.swift ✅
**What Changed**: Use ConnectionStore instead of CameraViewModel

**Before**:
```swift
struct WiFiSetupView: View {
    @ObservedObject var viewModel: CameraViewModel
    
    Button("Connect") {
        viewModel.connectToWiFiCamera(ip: cameraIP)
    }
}
```

**After**:
```swift
struct WiFiSetupView: View {
    @EnvironmentObject var connectionStore: ConnectionStore
    
    Button("Connect") {
        connectionStore.connect(ip: cameraIP)
    }
}
```

**Dependencies**: ConnectionStore only (minimal dependency)
**Preview**: Updated with MockCameraService

---

#### 4. ConnectingView.swift ✅
**What Changed**: Use ConnectionStore for retry status and IP display

**Before**:
```swift
struct ConnectingView: View {
    let ipAddress: String
    let retryCount: Int
    let maxRetries: Int
    
    var body: some View {
        Text(ipAddress)
        if retryCount > 0 {
            Text("Attempt \(retryCount + 1) of \(maxRetries)")
        }
    }
}
```

**After**:
```swift
struct ConnectingView: View {
    @EnvironmentObject var connectionStore: ConnectionStore
    
    var body: some View {
        Text(connectionStore.connectedIP ?? "...")
        if connectionStore.retryCount > 0 {
            Text("Attempt \(connectionStore.retryCount + 1) of 3")
        }
    }
}
```

**Dependencies**: ConnectionStore only
**Preview**: Updated with mock data

---

#### 5. ConnectedView.swift ✅
**What Changed**: Remove `shouldDismiss` binding, use ConnectionStore for display data

**Before**:
```swift
struct ConnectedView: View {
    let cameraModel: String
    let ipAddress: String
    @Binding var shouldDismiss: Bool
    
    var body: some View {
        Text(cameraModel)
        Text(ipAddress)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                shouldDismiss = true  // Manual transition
            }
        }
    }
}
```

**After**:
```swift
struct ConnectedView: View {
    @EnvironmentObject var connectionStore: ConnectionStore
    
    var body: some View {
        Text(connectionStore.cameraName)
        Text(connectionStore.connectedIP ?? "")
        // No onAppear - AppCoordinator handles auto-transition
    }
}
```

**Key Change**: Auto-transition logic moved to AppCoordinator (1.5s timer in coordinator, not in view)
**Dependencies**: ConnectionStore only
**Preview**: Updated with mock data

---

#### 6. LiveCaptureView.swift ✅
**What Changed**: Use both ConnectionStore and PhotoStore, eliminate viewModel dependency

**Before**:
```swift
struct LiveCaptureView: View {
    @ObservedObject var viewModel: CameraViewModel
    
    var body: some View {
        List {
            ForEach(viewModel.capturedPhotos) { photo in ... }
        }
        .toolbar {
            Text(viewModel.eventName)
            Text(viewModel.cameraName)
            Circle().fill(viewModel.wifiService.isConnected ? .green : .gray)
            Button("Disconnect") {
                viewModel.disconnectWiFi()
            }
        }
    }
}
```

**After**:
```swift
struct LiveCaptureView: View {
    @EnvironmentObject var connectionStore: ConnectionStore
    @EnvironmentObject var photoStore: PhotoStore
    
    var body: some View {
        List {
            ForEach(photoStore.photos) { photo in ... }
        }
        .toolbar {
            Text(connectionStore.eventName)
            Text(connectionStore.cameraName)
            Circle().fill(connectionStore.connectionState == .connected ? .green : .gray)
            Button("Disconnect") {
                connectionStore.disconnect()
                photoStore.clearPhotos()
            }
        }
    }
}
```

**Key Changes**:
- Photos from `photoStore.photos` instead of `viewModel.capturedPhotos`
- Connection status from `connectionStore.connectionState`
- Event/camera name from `connectionStore`
- Disconnect calls both stores explicitly
- Preview uses AppCoordinator with mock service

**Dependencies**: Both ConnectionStore and PhotoStore

---

#### 7. ConnectionErrorView.swift ✅
**What Changed**: Use AppCoordinator to reset state instead of callback

**Before**:
```swift
struct ConnectionErrorView: View {
    let errorMessage: String
    let onTryAgain: () -> Void
    
    Button("Try Again") {
        onTryAgain()  // Callback prop
    }
}
```

**After**:
```swift
struct ConnectionErrorView: View {
    @EnvironmentObject var coordinator: AppCoordinator
    let errorMessage: String
    
    Button("Try Again") {
        coordinator.appState = .idle
        coordinator.connectionStore.cancelConnection()
    }
}
```

**Dependencies**: AppCoordinator (to reset app state)
**Preview**: Updated with coordinator

---

### View Dependency Matrix (Final)

| View | Coordinator | ConnectionStore | PhotoStore | Props |
|------|------------|----------------|-----------|-------|
| ContentView | ✅ | ❌ | ❌ | 0 |
| WiFiSetupView | ❌ | ✅ | ❌ | 0 |
| ConnectingView | ❌ | ✅ | ❌ | 0 |
| ConnectedView | ❌ | ✅ | ❌ | 0 |
| LiveCaptureView | ❌ | ✅ | ✅ | 0 |
| ConnectionErrorView | ✅ | ❌ | ❌ | 1 (errorMessage) |

**Before Phase 4**: Every view received `viewModel: CameraViewModel` as a prop (prop drilling)
**After Phase 4**: Zero prop drilling, minimal dependencies via `@EnvironmentObject`

---

### Preview Updates ✅

All 7 views updated with proper preview code using AppCoordinator and MockCameraService:

```swift
#Preview {
    let mockService = MockCameraService()
    let coordinator = AppCoordinator(cameraService: mockService)
    
    // Set up state as needed
    coordinator.connectionStore.connectedIP = "172.20.10.2"
    
    return ViewName()
        .environmentObject(coordinator)  // If needed
        .environmentObject(coordinator.connectionStore)  // If needed
        .environmentObject(coordinator.photoStore)  // If needed
}
```

---

### Build Verification ✅

**Command**:
```bash
xcodebuild -scheme SabaiPicsStudio -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)' clean build
```

**Result**: 
```
** BUILD SUCCEEDED **
```

**Warnings**: Only vendor library warnings (GPhoto2Framework) - no app code warnings

---

### What's NOT Changed (Phase 5 Work)

- ✅ **CameraViewModel still exists** - Not deleted yet (Phase 5 will remove it)
- ✅ **AppState enum still in CameraViewModel.swift** - Will extract in Phase 5
- ✅ **USB legacy code (CameraFoundView)** - Not refactored (disabled feature)

---

### Verification Checklist ✅

- [x] App builds successfully
- [x] All views use `@EnvironmentObject` instead of props
- [x] No more prop drilling (0 props passed down)
- [x] ContentView routes via `coordinator.appState`
- [x] WiFiSetupView calls `connectionStore.connect()`
- [x] ConnectingView displays `connectionStore.connectedIP` and `retryCount`
- [x] ConnectedView displays `connectionStore.cameraName` and `connectedIP`
- [x] ConnectedView auto-transitions via AppCoordinator (no local timer)
- [x] LiveCaptureView uses `photoStore.photos` for list
- [x] LiveCaptureView uses `connectionStore` for toolbar
- [x] LiveCaptureView disconnect calls both stores
- [x] ConnectionErrorView uses coordinator to reset state
- [x] All preview blocks updated with AppCoordinator
- [x] Minimal dependencies (views only access stores they need)

---

### Next Steps (Phase 5)

1. Delete `CameraViewModel.swift` (god object)
2. Extract `AppState` enum to its own file
3. Update any remaining references to viewModel
4. Clean up imports
5. Final build verification

---

### Impact Summary

**Lines of Code Changed**: ~200 lines across 7 view files
**New Dependencies**: 0 (used existing AppCoordinator + stores from Phase 3)
**Prop Drilling Eliminated**: 100% (was 7 views with props, now 0)
**Build Time**: No significant change
**Runtime Performance**: No change (same SwiftUI patterns, different injection method)

**Developer Experience**:
- ✅ Easier to test views in isolation (just inject mock coordinator)
- ✅ Cleaner view signatures (no more `viewModel: CameraViewModel`)
- ✅ Better separation of concerns (views only know about stores they need)
- ✅ Previews are self-contained and testable

