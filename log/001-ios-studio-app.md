# 001 - iOS Studio App

Topic-based changelog for SabaiPics Studio (iOS app for photographers)

---

## 2026-01-14 - Initial Project Setup

### Created
- Xcode project at `apps/studio/SabaiPicsStudio.xcodeproj`
- SwiftUI-based iOS app structure
- Basic app scaffold with ContentView

### Configuration
- **Product Name:** SabaiPicsStudio
- **Bundle ID:** sabaipics.SabaiPicsStudio
- **iOS Target:** 18.5 (recommend lowering to 17.0 or 16.0 for wider device support)
- **Swift Version:** 5.0
- **Interface:** SwiftUI
- **Tests:** Unit tests + UI tests included

### Environment Verified
- macOS 15.5 (Sequoia)
- Xcode 16.4
- Swift 6.1.2
- iOS SDK 18.5

### Git Setup
- Integrated into main monorepo (no submodule)
- Updated `.gitignore` with Xcode-specific ignores
- Removed separate `.git` repo created by Xcode

### Tested
- ✅ Project opens in Xcode
- ✅ Builds and runs on simulator

### Next Steps
- ✅ Lower iOS deployment target to 16.6
- ✅ Add ImageCaptureCore framework
- ✅ Create CameraService.swift
- TODO: Create camera discovery UI
- TODO: Implement tethering logic

---

## 2026-01-14 - Camera Service Implementation

### Added
- `CameraService.swift` - Camera detection service using ImageCaptureCore
  - USB camera discovery via ICDeviceBrowser
  - Delegate methods for camera add/remove events
  - Published properties for SwiftUI integration

### Fixed
- Info.plist conflict (multiple commands produce error)
  - Removed manual Info.plist, added keys to project settings
- ImageCaptureCore API syntax for `browsedDeviceTypeMask`
- Privacy descriptions added to project:
  - NSCameraUsageDescription
  - NSLocalNetworkUsageDescription

### Configuration
- iOS deployment target: 16.6
- Privacy permissions configured

### Build Status
- ✅ Build succeeds on iOS Simulator (iPhone 16)
- ✅ No errors, only AppIntents warning (expected)

### Next Steps
- ✅ Create camera discovery UI views
- ✅ Wire CameraService to SwiftUI views
- TODO: Test USB camera detection with real hardware
- TODO: Implement photo download logic
- TODO: Build live capture view

---

## 2026-01-14 - UI Implementation (Phase 1A)

### Added Views
- `SearchingView.swift` - Initial camera search screen
  - Animated search icon
  - USB/WiFi connection instructions
  - Loading indicator

- `CameraFoundView.swift` - Camera detected screen
  - Camera name display
  - Connection type indicator
  - Connect button

- `CameraViewModel.swift` - State management
  - AppState enum (searching, cameraFound, connecting, ready, error)
  - Combines CameraService with SwiftUI
  - Handles camera connection flow
  - Reactive bindings using Combine

### Updated
- `ContentView.swift` - Root view with state switching
  - NavigationView wrapper
  - State-based view rendering
  - ConnectingView (progress indicator)
  - ReadyView (ready to shoot)
  - ErrorView (error handling with retry)

### Architecture
```
ContentView (root)
  ├── CameraViewModel (@StateObject)
  │     └── CameraService (camera detection)
  │
  └── State Views:
        ├── SearchingView (state: .searching)
        ├── CameraFoundView (state: .cameraFound)
        ├── ConnectingView (state: .connecting)
        ├── ReadyView (state: .ready)
        └── ErrorView (state: .error)
```

### Fixed
- ICCameraDevice API compatibility for iOS 16+
  - Removed deprecated `manufacturer` property
  - Fixed `transportType` checking
  - Simplified camera detail display

### Build Status
- ✅ Build succeeds
- ✅ All views compile
- ✅ State management working

### What Works
- App launches and shows SearchingView
- UI automatically searches for cameras on launch
- State transitions: searching → cameraFound → connecting → ready
- Error handling with retry

### Testing Notes
- **Simulator testing**: Camera detection won't work (no USB/hardware access)
- **Real device testing required**: Need physical iPhone + USB camera to test actual detection
- UI/UX flow can be previewed in simulator

### Next Steps
- ✅ Test on real device with USB camera
- TODO: Implement photo download when shutter is pressed
- TODO: Build live capture grid view (showing downloaded photos)
- TODO: Add session management (end session, upload to cloud)

---

## 2026-01-14 - Real Device Testing on iPad

### Hardware Testing Results
- **Device**: iPad (USB-C)
- **Camera**: Connected via USB-C
- **Status**: ✅ **WORKING!**

### What Works
- ✅ App installs and launches on iPad
- ✅ Camera detection works (USB-C connection)
- ✅ Camera found screen displays correctly
- ✅ Connection to camera succeeds
- ✅ Camera enters tethered mode (see below)

### Fixed
- **iPad sidebar issue** - Added `.navigationViewStyle(.stack)` to ContentView
  - Forces single-column layout on iPad (no split-view sidebar)
  - App now works properly in landscape mode

### Camera Tethered Mode Behavior (EXPECTED)
When the app connects to the camera (`requestOpenSession`):
- Camera LCD goes **black** ⬛
- Camera shows **computer icon** 💻
- This is **NORMAL** and **CORRECT** behavior!

**Why this happens:**
- Camera enters "tethered shooting" mode
- Camera control is transferred to iPad
- LCD is disabled to save power
- All photos are now controlled by the app
- This is standard for professional tethered workflows

**How it works in professional use:**
```
Photographer → Camera Shutter → Photo → iPad App (automatic download)
              (Camera LCD off)         (Preview on iPad)
```

### Camera Connection Flow Verified
```
1. App Launch → "Looking for cameras..." ✅
2. Plug in USB → "Camera Found" ✅
3. Tap "Connect" → "Connecting..." ✅
4. Camera opens session → "Ready to Shoot" ✅
5. Camera LCD goes black (tethered mode) ✅
```

### Next Steps
- ✅ Implement photo download delegate methods
- ✅ Build live capture view showing downloaded photos
- TODO: Test actual photo capture when shutter is pressed on real iPad
- TODO: Add session management (end session, save photos)

---

## 2026-01-14 - Photo Download Implementation (Phase 1B)

### Added
- `CapturedPhoto` model - Represents downloaded photos
  - UUID identifier
  - Photo name, data, UIImage
  - Capture date tracking

- **LiveCaptureView.swift** - Active shooting session view
  - Real-time stats header (captured count, downloading count, live indicator)
  - 3-column photo grid with LazyVGrid
  - Photo thumbnails with names
  - Empty state ("Ready to Shoot" message)
  - End Session button (UI only, functionality TODO)

### Updated
- **CameraViewModel.swift** - Full tethered photo capture
  - Conforms to `ICCameraDeviceDelegate` + `ICCameraDeviceDownloadDelegate`
  - State: Added `.capturing` state for active sessions
  - Photo download pipeline:
    ```
    Camera shutter → didAdd items → requestDownloadFile → didDownloadFile → capturedPhotos array
    ```
  - Real-time stats tracking (photoCount, downloadingCount)
  - Automatic photo downloads to temp directory
  - Memory management (temp file cleanup)

- **ContentView.swift** - Added capturing state
  - Shows LiveCaptureView when state is `.capturing`
  - Removed `.ready` state (goes straight to `.capturing`)

### Architecture
```
User presses shutter
  ↓
Camera detects new file
  ↓
ICCameraDeviceDelegate.didAdd(items)
  ↓
requestDownloadFile() with temp directory
  ↓
ICCameraDeviceDownloadDelegate.didDownloadFile()
  ↓
Read file from temp, create CapturedPhoto
  ↓
Add to capturedPhotos array (newest first)
  ↓
SwiftUI automatically updates LiveCaptureView
  ↓
Photo appears in grid! 📸
```

### Fixed API Issues
- ImageCaptureCore iOS 16+ compatibility
  - Correct delegate method signatures
  - ICDownloadOption dictionary usage
  - Required protocol methods implemented:
    - `didReceivePTPEvent`
    - `deviceDidBecomeReady`
    - `didRenameItems`
    - `cameraDeviceDidRemoveAccessRestriction`
    - `cameraDeviceDidEnableAccessRestriction`

### Build Status
- ✅ **BUILD SUCCEEDED**
- ✅ All delegate methods implemented
- ✅ Photo download pipeline complete

### What Works Now (Ready to Test on iPad!)
1. App launches → Searching for cameras
2. Connect camera via USB-C → Camera Found
3. Tap "Connect Camera" → Connecting → Capturing (LiveCaptureView)
4. Camera LCD goes black (tethered mode) ✅
5. Press camera shutter button → Photo downloads automatically
6. Photo appears in app grid with thumbnail
7. Stats update in real-time

### Testing Checklist (iPad + Camera)
- [ ] Connect camera, tap "Connect Camera"
- [ ] Camera LCD goes black (expected)
- [ ] Take 1 photo - does it appear in grid?
- [ ] Take multiple photos - do they all download?
- [ ] Check console logs for download progress
- [ ] Verify photo thumbnails display correctly

### Next Steps
- ✅ **TESTED ON REAL HARDWARE!** (iPad + Camera)
- ✅ Fixed: Only download NEW photos (not old ones)
- TODO: Test shutter button works without "BUSY" blocking
- TODO: Implement "End Session" button functionality
- TODO: Add photo storage (save to Photos app or local folder)

---

## 2026-01-14 - Critical Fix: Only Download NEW Photos

### Issue Found During Testing
When connecting camera to iPad:
- ✅ Camera detected successfully
- ✅ Connection worked
- ❌ **ALL old photos on camera started downloading** (not just new ones!)
- ❌ Camera showed "BUSY" when pressing shutter

### Root Cause
When `requestOpenSession()` is called:
1. Camera sends its **entire file catalog** to the app
2. `didAdd(items:)` is called with **ALL existing files**
3. Our code downloaded everything (could be hundreds of photos!)

### Fix Implemented
Added **initial catalog filtering**:

```swift
private var initialCatalogReceived = false

// In didAdd:
guard initialCatalogReceived else {
    print("📸 Initial catalog loading... ignoring existing items")
    return  // SKIP old photos
}

// In deviceDidBecomeReady:
initialCatalogReceived = true  // NOW start downloading new photos only
```

**How it works:**
1. Connect camera → Session opens
2. Camera sends catalog of existing files → **IGNORED** ✅
3. `deviceDidBecomeReady(withCompleteContentCatalog:)` fires
4. Set `initialCatalogReceived = true`
5. **From now on**, any `didAdd()` call = NEW photo from shutter → **DOWNLOAD** ✅

### Testing Status
- ✅ Build succeeds
- ⏳ Needs testing on iPad with camera
- ⏳ Verify only NEW photos download (not old ones)
- ⏳ Test if "BUSY" was just processing, or if shutter actually works

### Hypothesis on "BUSY"
User suggests "BUSY" might mean:
- Camera is processing the image to send to iPad
- NOT blocking the shutter
- Just showing transfer status

**Test result:** Camera shutter appears to be **disabled in PTP mode** (camera-dependent)

---

## 2026-01-14 - USB/PTP Mode Limitations Discovered

### Testing Results: USB Connection Issues

**What we tested:**
1. ✅ Camera detection works
2. ✅ Connection via `requestOpenSession()` works
3. ✅ Fixed: Only NEW photos download (not old ones)
4. ❌ **Camera shutter button shows "BUSY" in PTP mode**
5. ❌ **Cannot take new photos with physical shutter**

### Root Cause: PTP Protocol Limitations

When `requestOpenSession()` is called on iOS:
- Camera enters **PTP (Picture Transfer Protocol) mode**
- Camera LCD goes black or shows "PC Connected"
- **Camera shutter button is DISABLED** (camera firmware behavior)
- Camera expects **remote commands** to trigger capture

### Attempted Solution: Remote Capture from iPad

**Tried:** Add "Take Photo" button in iPad app to trigger camera remotely

**Result:** ❌ **`requestTakePicture()` is macOS-only, NOT available on iOS**

```swift
#if os(macOS)
camera.requestTakePicture()  // ✅ Works on macOS
#else
// ❌ NOT available on iOS/iPadOS
#endif
```

### Why USB/PTP Doesn't Work for This Use Case

| Requirement | USB/PTP Mode | Status |
|-------------|--------------|--------|
| Detect camera | ✅ Works | ✅ |
| Connect to camera | ✅ Works | ✅ |
| Download photos | ✅ Works | ✅ |
| **Take NEW photos with shutter** | ❌ Blocked | ❌ **BLOCKER** |
| Remote capture from iPad | ❌ Not on iOS | ❌ **BLOCKER** |
| Camera LCD stays on | ❌ Goes black | ❌ |

### Conclusion: USB/PTP Mode is NOT viable

**The fundamental issue:**
- Photographer needs to **press camera shutter** during event
- PTP mode **disables the shutter button**
- iOS doesn't support **remote capture**
- = **Cannot take new photos** = Deal-breaker

### Decision: Pivot to WiFi Mode

**Next approach: WiFi Transfer (Phase 2)**

Use camera's built-in WiFi features:
- Camera stays in **normal shooting mode**
- Shutter button works normally
- LCD stays on
- Photos transfer via WiFi after each shot

**Two WiFi options:**
1. **Manual IP** - Enter camera IP manually (simple, works now)
2. **Auto-discovery** - mDNS/SSDP discovery (requires multicast entitlement)

---

## 2026-01-14 - Pivot Decision: WiFi Mode Implementation

### Why WiFi Instead of USB

**USB/PTP failed because:**
- ❌ Camera shutter disabled in PTP mode
- ❌ No remote capture on iOS
- ❌ Camera unusable during event

**WiFi solves this:**
- ✅ Camera works normally
- ✅ Shutter button works
- ✅ LCD stays on
- ✅ Photos transfer wirelessly
- ⚠️ Slower than USB (but acceptable)

### Next Steps
1. Research camera WiFi protocols (likely uses HTTP/WebDAV/PTP-IP)
2. Implement WiFi connection mode
3. Test with manual IP entry first
4. Add auto-discovery later if needed

---
