# 002 - WiFi Camera Connection via GPhoto2Framework

Topic-based changelog for WiFi camera connectivity research and implementation

---

## 2026-01-14 - USB/PTP Limitations & Pivot to WiFi

### Problem: USB/PTP Mode Not Viable

After testing USB connection with ImageCaptureCore on iPad:

**What Didn't Work:**
- ❌ Camera shutter button shows "BUSY" when pressed
- ❌ Camera enters PTP tethered mode (LCD goes black)
- ❌ Cannot take NEW photos with physical shutter button
- ❌ `requestTakePicture()` is macOS-only (not available on iOS)
- ❌ All old photos on camera started downloading (fixed, but...)
- ❌ **Core issue: Camera shutter is disabled in PTP mode**

**Root Cause:**
- PTP (Picture Transfer Protocol) over USB takes control of camera
- Camera firmware disables shutter button when in PTP host mode
- iOS ImageCaptureCore doesn't support remote capture commands
- = **Cannot take new photos during event** = Deal-breaker for photographers

**Decision:** Pivot to WiFi connection using PTP/IP protocol

---

## 2026-01-14 - WiFi Research & Documentation Discovery

### Found Comprehensive Documentation

**Location:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/ios/`

**Key findings:**
- 15 markdown files with complete technical documentation
- PTP/IP protocol details (port 15740)
- UPnP/SSDP discovery protocol (UDP 239.255.255.250:1900)
- 90+ camera models with confirmed PTP/IP support
- GPhoto2Framework GitHub repository reference

### Protocol Details Discovered

**PTP/IP (Picture Transfer Protocol over IP):**
- **Standard:** ISO 15740:2013
- **Port:** TCP 15740 (primary connection)
- **Discovery:** UPnP/SSDP multicast (optional, for auto-discovery)
- **Connection:** Direct IP connection to camera

**Canon WiFi Settings:**
- **Default IP:** 192.168.1.1 (most Canon cameras)
- **Alternative IPs:** 192.168.1.10 (newer EOS R), 192.168.2.1 (some PowerShot)
- **Camera Model String:** "Canon EOS (WLAN)"
- **Protocol:** "ptpip"
- **Connection String:** `ptpip:192.168.1.1`

**Other Brands:**
- Nikon: 192.168.1.1
- Sony: 192.168.122.1
- Fujifilm: 192.168.0.1 (uses ports 55740-55742)

### Apple Entitlements Required

**For Auto-Discovery (Phase 3):**
- Entitlement: `com.apple.developer.networking.multicast`
- Info.plist: `NSLocalNetworkUsageDescription`
- Approval timeline: 2-4 weeks from Apple

**For Manual IP (Phase 2):**
- No special entitlement needed!
- Only requires standard network access

---

## 2026-01-14 - GPhoto2Framework Discovery & Setup

### Repository Cloned

**GitHub:** https://github.com/touchbyte/GPhoto2Framework

**What it is:**
- iOS port of libgphoto2
- Production-proven (used by PhotoSync app on App Store)
- Supports PTP/IP WiFi connections
- Objective-C wrapper around C library
- Last updated: August 2022

**Capabilities:**
- Connect to camera via WiFi (PTP/IP)
- Event monitoring for new photos (`GP_EVENT_FILE_ADDED`)
- File listing and download
- Chunked downloads with progress callbacks
- Supports Canon, Nikon, Sony, Fuji, Panasonic

**Location:**
```
/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/GPhoto2Framework/
```

### Repository Structure

```
GPhoto2Framework/
├── GPhoto2Framework/
│   ├── GPhoto2Framework/          # Framework wrapper (minimal)
│   ├── GPhoto2Example/            # Example iOS app ← WE MODIFIED THIS
│   │   ├── ViewController.m       # Main implementation
│   │   └── ViewController.h       # Header file
│   └── libgphoto2/                # Core C library
│       ├── camlibs/ptp2/          # PTP2 camera driver
│       └── libgphoto2_port/ptpip/ # PTP/IP transport layer
├── CANON_WIFI_TEST_SETUP.md       # Created by subagent
└── QUICK_TEST_GUIDE.md            # Created by subagent
```

---

## 2026-01-14 - GPhoto2Example Adaptation for Canon WiFi

### Subagent Task: Adapt Example App

**Goal:** Modify GPhoto2Example to work with Canon EOS cameras via WiFi for testing

**Files Modified:**
1. `ViewController.h` - Added properties for event tracking
2. `ViewController.m` - Added ~400 lines of Canon WiFi code

### Key Features Implemented

**1. Pre-configured Canon WiFi Settings**
```objc
#define CANON_WIFI_IP @"192.168.1.1"
#define CANON_CAMERA_MODEL @"Canon EOS (WLAN)"
#define CANON_PROTOCOL @"ptpip"
```

**2. Enhanced UI (Programmatic)**
- Status label with color coding:
  - Red: Disconnected
  - Orange: Connecting
  - Green: Connected
  - Blue: Monitoring
- Photo count label (detected photos / total on camera)
- Event log label (last 5 events with timestamps)
- "Start Event Monitor" button (green)
- "Stop Monitor" button (red)
- Download progress view

**3. Event Monitoring System**

**Core Implementation:**
```objc
// Event monitoring loop
- (void)runEventMonitorLoop {
    while (self.isMonitoring) {
        CameraEventType evttype;
        void *evtdata;

        int ret = gp_camera_wait_for_event(camera, 1000, &evttype, &evtdata, context);

        if (evttype == GP_EVENT_FILE_ADDED) {
            // NEW PHOTO DETECTED! 📸
            CameraFilePath *path = (CameraFilePath*)evtdata;

            // Get file info
            CameraFileInfo info;
            gp_camera_file_get_info(camera, path->folder, path->name, &info, context);

            // Update UI and logs
            [self updatePhotoCount:++self.detectedPhotoCount];
            [self logEvent:[NSString stringWithFormat:@"File added: %s", path->name]];
        }
    }
}
```

**Events Handled:**
- `GP_EVENT_FILE_ADDED` - New photo taken (main event we care about!)
- `GP_EVENT_TIMEOUT` - No activity (normal)
- `GP_EVENT_UNKNOWN` - Unknown event
- `GP_EVENT_FOLDER_ADDED` - New folder created
- `GP_EVENT_CAPTURE_COMPLETE` - Capture completed
- `GP_EVENT_FILE_CHANGED` - File modified

**4. Threading Architecture**
- **Main Thread:** UI updates, user interactions
- **Background Thread (connection):** Camera connection via `gp_camera_init`
- **Background Serial Queue (events):** Event monitoring loop
- All UI updates dispatched to main thread (`dispatch_async(dispatch_get_main_queue())`)

**5. Comprehensive Logging**
```objc
// Console logging for debugging
NSLog(@"=== NEW PHOTO DETECTED ===");
NSLog(@"File: %s", filename);
NSLog(@"Folder: %s", folder);
NSLog(@"File size: %lld bytes", filesize);
NSLog(@"========================");

// Event log (circular buffer, last 5 events)
[self logEvent:@"Connection successful!"];
[self logEvent:@"Event monitor started"];
[self logEvent:@"File added: IMG_1234.CR2"];
```

**6. Helper Methods**
- `updateStatusLabel:color:` - Thread-safe status updates
- `updatePhotoCount:` - Updates photo counter
- `logEvent:` - Adds timestamped entries (keeps last 5)
- `setupCustomUI` - Creates all UI elements programmatically

### Connection Flow

**Step-by-step:**
```
1. User taps "Connect to Canon"
   ↓
2. Validates IP address (192.168.1.1)
   ↓
3. Background thread: connectCamera:
   ↓
4. Create GPContext and Camera instances
   ↓
5. Load camera abilities for "Canon EOS (WLAN)"
   ↓
6. Setup port info for "ptpip:192.168.1.1"
   ↓
7. Configure ptpip settings (hostname, etc.)
   ↓
8. gp_camera_init() - Establishes TCP connection to port 15740
   ↓
9. Success: Enable "Start Event Monitor" button
   ↓
10. User taps "Start Event Monitor"
   ↓
11. Background queue: runEventMonitorLoop
   ↓
12. Polls camera every 1 second: gp_camera_wait_for_event()
   ↓
13. When GP_EVENT_FILE_ADDED detected:
    - Extract file info
    - Update counter
    - Log event
    - Update UI
   ↓
14. Loop continues until "Stop Monitor" pressed
```

### Build Status

**✅ BUILD SUCCESSFUL**

```bash
xcodebuild -project GPhoto2Framework.xcodeproj \
  -scheme GPhoto2Example \
  -sdk iphonesimulator \
  -configuration Debug build
```

**Warnings:**
- Deployment target warnings (cosmetic)
- libgphoto2 documentation warnings (library-related)
- No functional impact

**Issues Fixed:**
- Initial error: Property `newPhotosList` violated Cocoa naming conventions
- Solution: Renamed to `detectedPhotosList`

### Documentation Created

**1. CANON_WIFI_TEST_SETUP.md** (650+ lines)
- Complete change summary
- Step-by-step testing procedures
- Expected console output examples
- Troubleshooting guide
- Technical details (connection flow, event flow, threading)
- Known limitations
- Future enhancement ideas

**2. QUICK_TEST_GUIDE.md** (Quick reference)
- 5-minute test procedure
- Visual indicators to watch for
- Quick troubleshooting table
- Test scenarios
- Demo script
- Expected console output

---

## 2026-01-14 - Testing Plan & Current Status

### Test Environment

**Hardware:**
- iPad (USB-C) - Device ID: 00008120-001171EA04114032
- Canon camera (model TBD - user to confirm)

**Network Setup:**
1. Canon camera creates WiFi network (Access Point mode)
2. SSID shown on camera LCD (e.g., "Canon_EOS_R5_123")
3. Camera IP shown on LCD (usually 192.168.1.1)
4. iPad connects to camera's WiFi network
5. App connects to camera IP via PTP/IP port 15740

### Testing Procedure

**Step 1: Camera Setup**
- Enable WiFi on Canon camera
- Select "Connect to Smartphone" mode
- Note SSID and IP address from LCD

**Step 2: iPad Setup**
- Settings → WiFi → Connect to camera network
- Open GPhoto2Example app
- IP pre-filled: 192.168.1.1

**Step 3: Connection Test**
- Tap "Connect to Canon"
- Wait for green "Status: Connected"
- Check console for connection logs

**Step 4: Event Monitoring Test**
- Tap "Start Event Monitor"
- Status changes to blue "Monitoring..."
- Take photo with camera shutter button
- Check for "NEW PHOTO DETECTED!" in console
- Check photo counter increments
- Check event log shows file name

**Step 5: Repeat**
- Take multiple photos
- Verify each is detected
- Check for any delays or missed photos

### Expected Results

**Console Output (Success):**
```
=== Starting Camera Connection ===
Camera IP: 192.168.1.1
Camera Model: Canon EOS (WLAN)
Protocol: ptpip
Connection String: ptpip:192.168.1.1
...
✅ Connected to: Canon EOS R5
...
=== Event Monitoring Started ===
...
=== NEW PHOTO DETECTED ===
File: IMG_1234.CR2
Folder: /store_00010001/DCIM/100CANON
Full Path: /store_00010001/DCIM/100CANON/IMG_1234.CR2
File size: 25165824 bytes (24.00 MB)
File type: image/x-canon-cr2
========================
```

**iPad Screen (Success):**
- Status: "Connected" (green)
- Photo count: "Photos Detected: 1 (Total on camera: 145)"
- Event log: "[15:34:12] File added: IMG_1234.CR2"

### Current Status

**✅ Completed:**
- USB/PTP testing (failed, documented)
- WiFi protocol research
- GPhoto2Framework repository cloned
- GPhoto2Example app adapted for Canon
- Documentation created
- Build successful
- Code ready for testing

**⏳ Pending:**
- Test on real iPad with real Canon camera
- Verify WiFi connection works
- Verify event monitoring detects new photos
- Measure detection latency (how fast after shutter press)
- Test with multiple photos in quick succession
- Test disconnection/reconnection scenarios

**🔜 Next Steps:**
1. Test GPhoto2Example on iPad with Canon camera (5-10 mins)
2. If successful → Integrate GPhoto2Framework into SabaiPicsStudio
3. If issues → Debug and iterate

---

## 2026-01-14 - Key Learnings

### What We Learned

**1. ImageCaptureCore Limitations:**
- Works great for USB connections on macOS
- Limited functionality for USB on iOS (tethered mode blocks shutter)
- No remote capture support on iOS
- Not suitable for event photographers who need to use camera normally

**2. PTP/IP Protocol:**
- Allows camera to operate normally (LCD stays on, shutter works)
- Camera and app communicate over WiFi network
- Event system notifies app when new photos are taken
- Standard protocol (ISO 15740:2013) supported by major brands

**3. GPhoto2Framework:**
- Production-ready (used in PhotoSync app)
- Comprehensive PTP/IP support
- Event monitoring works via `gp_camera_wait_for_event()`
- Objective-C API (needs bridging for Swift)
- Well-documented in example code

**4. WiFi Connection Modes:**
- **Access Point Mode:** Camera creates WiFi, iPad joins (simple, works now)
- **Infrastructure Mode:** Both on same WiFi network (requires discovery)
- **Manual IP:** No entitlement needed (Phase 2)
- **Auto-discovery:** Requires multicast entitlement (Phase 3, future)

### Critical Success Factors

**For WiFi to work:**
1. ✅ Camera must have WiFi enabled
2. ✅ Camera must be in "Connect to Smartphone" mode
3. ✅ iPad must be on camera's WiFi network
4. ✅ Correct camera model string ("Canon EOS (WLAN)")
5. ✅ Correct protocol ("ptpip")
6. ✅ Correct IP address (check camera LCD)
7. ✅ Port 15740 must be accessible

**For event detection:**
1. ✅ Connection must be established first
2. ✅ Event loop must be running
3. ✅ Camera must be taking NEW photos (not browsing old ones)
4. ✅ App must poll with `gp_camera_wait_for_event()`

### Advantages of WiFi Approach

**vs USB/PTP:**
- ✅ Camera works normally (shutter button enabled)
- ✅ Camera LCD stays on
- ✅ Photographer can see camera settings
- ✅ No cables needed
- ✅ More flexible positioning
- ⚠️ Slower transfer than USB (acceptable for event photography)

**vs Post-Shoot Import:**
- ✅ Near real-time detection (1-2 second delay)
- ✅ Can preview photos during event
- ✅ Detect issues early (focus, exposure)
- ✅ Client preview during shoot

---

## Integration Plan (Next Phase)

### High-Level Plan

**Goal:** Integrate GPhoto2Framework into SabaiPicsStudio app

**Approach:**
1. Add GPhoto2Framework to SabaiPicsStudio project
2. Create Objective-C wrapper class (bridge to Swift)
3. Implement WiFi connection mode (parallel to existing USB code)
4. Add manual IP entry UI
5. Port event monitoring logic
6. Test end-to-end

### Architecture Changes

**Current SabaiPicsStudio (USB only):**
```
CameraViewModel (Swift)
  ↓
CameraService (Swift)
  ↓
ImageCaptureCore (Apple framework)
  ↓
USB Connection → Camera (PTP mode, shutter blocked ❌)
```

**New SabaiPicsStudio (USB + WiFi):**
```
CameraViewModel (Swift)
  ↓
ConnectionMode: .usb or .wifi
  ↓
  ├─ USB Mode:
  │    CameraService (Swift) → ImageCaptureCore → USB
  │
  └─ WiFi Mode:
       WiFiCameraService (Obj-C) → GPhoto2Framework → PTP/IP → WiFi
```

### Components to Build

**1. Framework Integration**
- Add GPhoto2Framework.framework to project
- Configure build settings
- Link framework

**2. Objective-C Bridge**
```objc
// WiFiCameraManager.h
@interface WiFiCameraManager : NSObject
- (BOOL)connectToCamera:(NSString *)ip
            cameraModel:(NSString *)model
                  error:(NSError **)error;
- (void)startEventMonitoring:(void (^)(NSString *filename,
                                       NSString *folder))callback;
- (void)stopEventMonitoring;
- (void)disconnect;
@end
```

**3. Swift Wrapper**
```swift
class WiFiCameraService: ObservableObject {
    private let bridge: WiFiCameraManager
    @Published var detectedPhotos: [CapturedPhoto] = []

    func connect(ip: String) async throws { ... }
    func startMonitoring() { ... }
    func stopMonitoring() { ... }
}
```

**4. UI Updates**
- Add connection mode picker (USB vs WiFi)
- Add manual IP entry screen
- Update SearchingView for WiFi mode
- Keep existing views for photo display

**5. State Management**
```swift
enum ConnectionMode {
    case usb
    case wifiManual(ip: String)
}

enum AppState {
    case searching(mode: ConnectionMode)
    case cameraFound(device: CameraDevice)
    case connecting
    case capturing
    case error(String)
}
```

### Files to Create/Modify

**New Files:**
- `WiFiCameraManager.h` - Obj-C bridge header
- `WiFiCameraManager.m` - Obj-C bridge implementation
- `WiFiCameraService.swift` - Swift wrapper
- `WiFiConnectionView.swift` - Manual IP entry UI
- `SabaiPicsStudio-Bridging-Header.h` - Obj-C to Swift bridge

**Modified Files:**
- `CameraViewModel.swift` - Add WiFi mode support
- `ContentView.swift` - Add connection mode picker
- `SearchingView.swift` - Update for WiFi instructions
- `Info.plist` - Add NSLocalNetworkUsageDescription

### Phases

**Phase 1: Framework Integration (1-2 hours)**
- Add GPhoto2Framework to project
- Configure build settings
- Verify it compiles

**Phase 2: Objective-C Bridge (2-3 hours)**
- Create WiFiCameraManager wrapper
- Implement connection logic
- Implement event monitoring
- Test from Objective-C

**Phase 3: Swift Integration (2-3 hours)**
- Create Swift wrapper class
- Bridge to ViewModel
- Handle threading and callbacks

**Phase 4: UI Updates (1-2 hours)**
- Add connection mode picker
- Add manual IP entry
- Update existing views

**Phase 5: Testing (1-2 hours)**
- Test WiFi connection
- Test event monitoring
- Test photo download
- Test error scenarios

**Total Estimate: 8-12 hours of development**

---

## Notes & Observations

### Canon Camera IP Addresses

**User question:** Do all Canon cameras use the same IP address?

**Answer:** Usually 192.168.1.1, but not always:
- Most Canon cameras in Access Point mode: `192.168.1.1`
- Some newer EOS R models: `192.168.1.10`
- Some PowerShot models: `192.168.2.1`
- Infrastructure mode (joining existing WiFi): Variable (DHCP assigned)

**Best practice:** Always check camera LCD when WiFi is enabled - it shows the exact IP.

### Technical Constraints

**iOS Limitations:**
- No `requestTakePicture()` support (macOS only)
- Must use event monitoring instead of active triggering
- Background processing limited (app must be foreground)

**PTP/IP Limitations:**
- Slower than USB (network overhead)
- Requires WiFi network setup
- Camera battery drain (WiFi active)
- Range limited by WiFi signal

**GPhoto2Framework:**
- Last updated August 2022
- Objective-C only (no Swift wrapper)
- C library underneath (manual memory management)
- Large binary size (includes libgphoto2)

### Future Enhancements

**Phase 3 (Auto-Discovery):**
- Implement UPnP/SSDP discovery
- Request multicast entitlement from Apple
- Eliminate manual IP entry
- Show list of discovered cameras

**Download Implementation:**
- Implement actual photo downloads
- Add progress tracking
- Implement local storage
- Add upload to SabaiPics API

**Error Recovery:**
- Handle WiFi disconnection
- Reconnect automatically
- Resume event monitoring
- Save partial downloads

**Optimization:**
- Adjust polling interval (1s vs 500ms)
- Implement connection pooling
- Cache camera info
- Reduce battery drain

---

## References

### Documentation
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/ios/` - Complete technical docs
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/GPhoto2Framework/CANON_WIFI_TEST_SETUP.md`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/GPhoto2Framework/QUICK_TEST_GUIDE.md`

### Code Locations
- **GPhoto2Example (adapted):** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/GPhoto2Framework/GPhoto2Framework/GPhoto2Example/`
- **SabaiPicsStudio (main app):** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/apps/studio/`
- **Original USB implementation:** `apps/studio/SabaiPicsStudio/CameraViewModel.swift`

### External Resources
- GPhoto2Framework: https://github.com/touchbyte/GPhoto2Framework
- libgphoto2: http://www.gphoto.org/doc/
- PTP/IP Standard: ISO 15740:2013

---

## Success Metrics

### Definition of Success

**GPhoto2Example Test:**
- ✅ Connects to Canon camera via WiFi
- ✅ Detects new photos within 2 seconds of shutter press
- ✅ Shows file name, path, and size
- ✅ Handles multiple photos in succession
- ✅ Stable connection for 10+ minutes

**SabaiPicsStudio Integration:**
- ✅ WiFi mode available in app
- ✅ Manual IP entry works
- ✅ Photos detected and downloaded
- ✅ UI updates in real-time
- ✅ No regressions in existing features

### Timeline

- **Research & Exploration:** 2026-01-14 (4 hours)
- **GPhoto2Example Adaptation:** 2026-01-14 (2 hours with subagent)
- **Testing:** 2026-01-14 (pending - user to test)
- **Integration:** TBD (8-12 hours estimated)

---

## End of Log 002

**Status:** GPhoto2Example adapted and ready for testing on iPad with Canon camera

**Next:** Test GPhoto2Example, then plan integration into SabaiPicsStudio
