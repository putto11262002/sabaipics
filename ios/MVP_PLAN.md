# WiFi Integration MVP - Final Implementation Plan

**Date:** 2026-01-14
**Status:** Ready to implement
**Target:** Canon cameras only (expandable later)
**Estimated Time:** 10-12 hours

---

## Final Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **USB Code** | Keep but disable | Future-proofing, minimal cost |
| **Bridge** | Full Service Layer | Clean architecture |
| **UI Flow** | Simple WiFi setup (IP entry) | Canon-focused, fast to implement |
| **Download** | Auto-download JPEG only | Fast, photographer-friendly |
| **RAW Warning** | Connection guide only | No popups, documented upfront |
| **Photo Display** | List view (filename + size + time) | Better for workflow |
| **ViewModel** | Unified | Single source of truth |
| **Camera Brand** | Canon only | MVP, expandable later |
| **Connection Error** | Stay on sheet with retry | Better UX |

---

## Implementation Phases (Shippable Increments)

Each phase is independently testable and can be demonstrated/shipped.

---

### ✅ Phase 1: Framework Setup & Bridge Foundation (2 hours) - COMPLETE

**Goal:** GPhoto2Framework integrated, compiles successfully, Objective-C bridge skeleton ready

**Tasks:**

- [x] **1.1** Add GPhoto2Framework to Xcode project
  - Drag `GPhoto2Framework/GPhoto2.xcframework` into project
  - Set "Embed & Sign" in Frameworks
  - Verify framework appears in project navigator

- [x] **1.2** Create bridging header
  - Create `SabaiPicsStudio-Bridging-Header.h`
  - Add `#import <GPhoto2/gphoto2.h>`
  - Set bridging header path in Build Settings

- [x] **1.3** Create Objective-C bridge files
  - Create `WiFiCameraManager.h` (interface)
  - Create `WiFiCameraManager.m` (implementation)
  - Add both files to Xcode project
  - Add to Build Phases → Compile Sources

- [x] **1.4** Implement basic connection skeleton
  - `connectWithIP:model:protocol:error:` method
  - `disconnect` method
  - Connection state enum
  - Delegate protocol definition

- [x] **1.5** Build and verify
  - Run `xcodebuild` or build in Xcode
  - Fix any linker errors
  - Ensure bridging header works

**Shippable Increment:**
✅ Project builds with GPhoto2Framework
✅ Objective-C bridge compiles
✅ No errors or warnings

**Test:**
```bash
cd apps/studio
xcodebuild -project SabaiPicsStudio.xcodeproj -scheme SabaiPicsStudio build
# Should succeed with 0 errors
```

---

### ✅ Phase 2: WiFi Connection (Canon Only) (2 hours) - COMPLETE

**Goal:** Can connect to Canon camera via WiFi, see connection status

**Tasks:**

- [x] **2.1** Complete WiFiCameraManager connection logic
  - Implement GPhoto2 abilities lookup for "Canon EOS (WLAN)"
  - Implement port info setup with "ptpip:IP"
  - Implement camera initialization
  - Add error handling with descriptive messages

- [x] **2.2** Create Swift service wrapper
  - Create `WiFiCameraService.swift`
  - Wrap WiFiCameraManager with Combine publishers
  - `@Published var isConnected: Bool`
  - `@Published var connectionError: String?`
  - Implement delegate conformance

- [x] **2.3** Update CameraViewModel
  - Add `wifiService: WiFiCameraService` property
  - Add WiFi bindings in `setupWiFiBindings()`
  - Add `connectToWiFiCamera(ip:)` method
  - Disable USB initialization (comment out)
  - Add connection mode: `.wifi`

- [x] **2.4** Create simple WiFi setup UI
  - Create `WiFiSetupView.swift`
  - IP address text field (default: "192.168.1.1")
  - Connect button
  - Camera model preset: "Canon EOS (WLAN)"
  - Connection instructions for Canon

- [x] **2.5** Update ContentView
  - Show WiFiSetupView on app launch (`.searching` state)
  - Show ConnectingView during connection
  - Handle connection errors

**Shippable Increment:**
✅ App launches with WiFi setup screen
✅ Can enter Canon camera IP
✅ Can connect to Canon camera via WiFi
✅ Connection success/failure feedback works

**Test on iPad:**
1. Launch app → see WiFi setup screen
2. Enter Canon camera IP (192.168.1.1)
3. Tap "Connect Camera"
4. Should see "Connecting..." → "Connected!" or error message

**Acceptance Criteria:**
- App builds and runs on iPad
- WiFi setup screen displays correctly
- Connection to Canon camera succeeds within 3 seconds
- Error message shows if IP wrong or camera off

---

### ✅ Phase 3: Photo Event Monitoring (2 hours) - COMPLETE

**Goal:** Detect when photographer takes photo on Canon camera

**Tasks:**

- [x] **3.1** Implement event monitoring in WiFiCameraManager
  - Add `startEventMonitoring` method
  - Create background monitoring thread
  - Implement `monitoringLoop` with `gp_camera_wait_for_event()`
  - Detect `GP_EVENT_FILE_ADDED` events
  - Call delegate when photo detected

- [x] **3.2** Add photo detection to WiFiCameraService
  - Add `@Published var detectedPhotos: [(filename: String, folder: String)]`
  - Implement delegate method `didDetectNewPhoto`
  - Append detected photos to array

- [x] **3.3** Wire photo detection to ViewModel
  - Listen to `wifiService.$detectedPhotos`
  - Log when new photos detected
  - Prepare for download (next phase)

- [x] **3.4** Add simple detection indicator to UI
  - Update LiveCaptureView to show detection
  - Add "Waiting for photos..." state
  - Add photo counter (detected but not downloaded)

**Shippable Increment:**
✅ Event monitoring runs after connection
✅ Console logs show when photo taken on camera
✅ UI updates when photo detected

**Test on iPad:**
1. Connect to Canon camera (Phase 2)
2. Camera enters LiveCaptureView
3. Take photo with camera shutter button
4. Within 2 seconds, console shows: "📸 NEW PHOTO: IMG_1234.JPG"
5. UI shows photo was detected

**Acceptance Criteria:**
- Event monitoring starts automatically after connection
- Photo detection happens within 2 seconds of shutter press
- Multiple rapid photos all detected correctly
- No crashes or freezing

---

### ☐ Phase 4: Photo Download (JPEG Only) (2 hours)

**Goal:** Automatically download JPEG photos, filter out RAW files

**Tasks:**

- [ ] **4.1** Implement photo download in WiFiCameraManager
  - Add `downloadPhotoAtPath:filename:completion:` method
  - Use `gp_camera_file_get()` for download
  - Download on background thread
  - Return NSData on completion
  - Add error handling

- [ ] **4.2** Add JPEG filtering in WiFiCameraService
  - Check file extension when photo detected
  - Only process `.JPG` and `.JPEG` files
  - Silently skip RAW files (`.CR2`, `.CR3`)
  - Log skipped files for debugging

- [ ] **4.3** Implement auto-download in ViewModel
  - When photo detected, trigger download automatically
  - Create `CapturedPhoto` from downloaded data
  - Insert at beginning of `capturedPhotos` array (newest first)
  - Update `photoCount` and `downloadingCount`

- [ ] **4.4** Add download progress to UI
  - Update stats header with download count
  - Show spinner on photos being downloaded
  - Checkmark when download complete

**Shippable Increment:**
✅ Photos auto-download after detection
✅ Only JPEG files downloaded (RAW ignored)
✅ Photos appear in app immediately
✅ Download progress visible

**Test on iPad:**
1. Connect to Canon camera
2. Take 1 photo → appears in app within 3 seconds
3. Take 5 photos rapid-fire → all appear in order
4. Set camera to RAW mode → no download (logged but not shown)
5. Set camera to JPEG+RAW → only JPEG downloads

**Acceptance Criteria:**
- JPEG photos download automatically
- RAW files silently ignored
- Photos display in list view
- Download completes within 5 seconds per photo
- No duplicate downloads

---

### ☐ Phase 5: Connection UX & Permission Flow (4 hours)

**Goal:** Premium connection experience with pre-flight permission check and auto-retry

**Related Documentation:**
- `log/003-local-network-permission-precheck.md` - Technical implementation plan
- `log/003-connection-flow-summary.md` - UI flow and scenarios

**Tasks:**

- [ ] **5.1** Create LocalNetworkPermissionChecker
  - Implement pre-flight permission trigger (169.254.255.255:1)
  - Add UserDefaults tracking for granted status
  - Add 5-second timeout safety
  - Test iOS permission prompt appears

- [ ] **5.2** Implement auto-retry logic with 15s timeout
  - Update WiFiCameraService with retry state (max 3 attempts)
  - Change connection timeout from 75s → 15s
  - Add exponential backoff (2s, 5s delays)
  - Implement `connectWithRetry()` method
  - Test timeout and retry scenarios

- [ ] **5.3** Create premium UI components
  - **ConnectingView.swift** - Animated searching screen
  - **ConnectedView.swift** - Success celebration (1s auto-transition)
  - **ErrorView.swift** - Connection failed with "Try Again"
  - Update **WiFiSetupView.swift** - Permission denied help text

- [ ] **5.4** Implement state machine in CameraViewModel
  - Add new states: `.connecting`, `.connected`
  - Implement state transitions
  - Add 1-second auto-transition from `.connected` to `.capturing`
  - Update ContentView to show correct view for each state

- [ ] **5.5** Test premium connection flow
  - First time user → Permission prompt → Success → 1s celebration → Main screen
  - Permission denied → WiFiSetupView with help text
  - Subsequent connections → Fast (skip pre-flight)
  - Network timeout → Auto-retry → Success
  - All retries fail (52s) → ErrorView with clear message

**Shippable Increment:**
✅ First connection succeeds without manual retry
✅ 15s timeout = 5x faster failure detection
✅ Multi-page flow with smooth transitions (like AirPods pairing)
✅ Clear error messages with actionable help
✅ Auto-retry handles transient network issues

**Test on iPad:**
1. Fresh install → Permission prompt → Connect → Success in ~8s
2. Deny permission → See help text on WiFiSetupView → Follow instructions
3. Subsequent connections → Fast (~3s, no pre-flight)
4. Turn camera off → All retries fail in 52s → Clear error
5. Weak network → First attempt fails → Auto-retry succeeds

**Acceptance Criteria:**
- Pre-flight permission check triggers before connection
- Connection timeout is 15 seconds (not 90s)
- Auto-retry with max 3 attempts, backoff delays
- ConnectedView shows for 1 second before main screen
- Premium feel: smooth animations, clear feedback
- Total max time for all failures: 52 seconds

---

### ☐ Phase 6: List View UI (1.5 hours)

**Goal:** Professional list view with photo metadata

**Tasks:**

- [ ] **5.1** Replace grid with list in LiveCaptureView
  - Remove `LazyVGrid` implementation
  - Add `List` with `ForEach(capturedPhotos)`
  - Remove grid-specific layout code

- [ ] **5.2** Create PhotoListRow component
  - 80x80 thumbnail on left
  - Filename (headline)
  - File size + relative time (caption)
  - Download status indicator (checkmark/spinner)
  - Proper spacing and padding

- [ ] **5.3** Add file size formatter
  - Create `formatFileSize(_ bytes: Int) -> String`
  - Use ByteCountFormatter
  - Show MB/KB appropriately

- [ ] **5.4** Add empty state for no photos
  - "Waiting for photos..." message
  - Camera aperture icon
  - Instructions: "Take photos with camera shutter button"

- [ ] **5.5** Polish list appearance
  - Smooth animations on photo insert
  - Proper list row styling
  - Dividers between photos
  - Pull-to-refresh (optional)

**Shippable Increment:**
✅ Professional list view displays photos
✅ Metadata shows correctly (filename, size, time)
✅ Smooth animations
✅ Empty state looks good

**Test on iPad:**
1. Connect to camera → see empty state with message
2. Take photo → photo appears with metadata
3. Verify filename shows correctly
4. Verify file size shows in MB
5. Verify relative time updates ("2m ago" → "3m ago")

**Acceptance Criteria:**
- List view looks professional
- All metadata displays correctly
- Animations smooth (no janky inserts)
- Large thumbnails (80x80)
- Easy to scan chronologically

---

### ☐ Phase 7: Session Management (1.5 hours)

**Goal:** End session cleanly, handle disconnection gracefully

**Tasks:**

- [ ] **6.1** Implement disconnect in WiFiCameraManager
  - Stop event monitoring thread
  - Call `gp_camera_exit()` and `gp_camera_free()`
  - Clean up context
  - Update connection state

- [ ] **6.2** Add disconnect in WiFiCameraService
  - Implement `disconnect()` method
  - Update `isConnected` to false
  - Clear detected photos array

- [ ] **6.3** Add disconnect in ViewModel
  - Implement `disconnectWiFi()` method
  - Stop monitoring
  - Disconnect service
  - Return to `.searching` state
  - Clear captured photos (optional - or keep them?)

- [ ] **6.4** Add "End Session" button to LiveCaptureView
  - Red button at bottom
  - Confirm before disconnect (alert)
  - Return to WiFi setup screen

- [ ] **6.5** Handle unexpected disconnection
  - Detect camera disconnect
  - Show error state
  - Allow reconnection

**Shippable Increment:**
✅ Can end session cleanly
✅ Disconnect returns to setup screen
✅ Unexpected disconnect handled gracefully
✅ Can reconnect after ending session

**Test on iPad:**
1. Connect to camera, take 3 photos
2. Tap "End Session" → confirm → return to setup
3. Reconnect → works again
4. During session, turn camera off → error shown
5. Turn camera back on → can reconnect

**Acceptance Criteria:**
- End session button works
- Disconnect completes within 1 second
- No memory leaks (test with Instruments)
- Can reconnect after disconnect
- Unexpected disconnect shows helpful error

---

### ☐ Phase 8: Polish & Error Handling (2 hours)

**Goal:** Production-ready UX with proper error handling

**Tasks:**

- [ ] **7.1** Improve error messages
  - "Camera not found at 192.168.1.1" (wrong IP)
  - "Camera not responding - check WiFi" (timeout)
  - "Connection lost - camera turned off?" (disconnect)
  - User-friendly language (no technical jargon)

- [ ] **7.2** Add connection instructions to WiFi setup
  - "How to enable WiFi on Canon" button
  - Sheet with step-by-step Canon WiFi setup
  - Screenshot/diagram (optional)
  - Tips section

- [ ] **7.3** Add RAW file info to instructions
  - Mention JPEG-only download
  - Explain JPEG+RAW mode works fine
  - Warn about RAW-only mode

- [ ] **7.4** Add loading states
  - Spinner during connection
  - Progress indicator during download
  - Smooth transitions between states

- [ ] **7.5** Add success feedback
  - Haptic feedback on photo download (optional)
  - Checkmark animation
  - Sound effect (optional, off by default)

- [ ] **7.6** Test edge cases
  - Camera off when connecting
  - Camera turns off during session
  - iPad loses WiFi
  - Very large files (10+ MB)
  - 50+ photos in one session
  - Rapid-fire shooting (5 photos/second)

- [ ] **7.7** Memory leak testing
  - Run Instruments (Leaks tool)
  - Take 50 photos, end session
  - Check for leaked memory
  - Fix any C-level leaks (gp_file_free, etc.)

**Shippable Increment:**
✅ All error messages user-friendly
✅ Setup instructions complete
✅ Loading states smooth
✅ No memory leaks
✅ App ready for field testing

**Test on iPad:**
1. All error scenarios show helpful messages
2. Setup instructions clear and accurate
3. 30-minute session with 30 photos → no crashes
4. Memory usage stays under 200 MB
5. App feels polished and professional

**Acceptance Criteria:**
- All errors handled gracefully
- No crashes during 30-minute session
- Memory usage < 200 MB with 50 photos
- Instructions clear for photographers
- Ready for real event testing

---

### ☐ Phase 9: Final Testing & Documentation (1 hour)

**Goal:** Verified working end-to-end, documented for handoff

**Tasks:**

- [ ] **8.1** End-to-end testing checklist
  - [ ] App launches correctly
  - [ ] WiFi setup screen shows
  - [ ] Can enter Canon camera IP
  - [ ] Connection succeeds within 3 seconds
  - [ ] Event monitoring starts automatically
  - [ ] Take 1 photo → appears in app
  - [ ] Take 5 photos → all appear
  - [ ] JPEG files download correctly
  - [ ] RAW files ignored (if tested)
  - [ ] List view shows all metadata
  - [ ] End session works
  - [ ] Can reconnect after ending
  - [ ] Error handling works
  - [ ] No crashes in 30-minute session

- [ ] **8.2** Update changelog
  - Append to `log/002-wifi-gphoto2-exploration.md`
  - Document what was implemented
  - Note any issues found
  - List what's ready for Phase 2

- [ ] **8.3** Create quick start guide for photographers
  - 1-page PDF: "How to use SabaiPics Studio"
  - Canon WiFi setup steps
  - App connection steps
  - Troubleshooting common issues

- [ ] **8.4** Document known limitations
  - Canon only (other brands Phase 2)
  - Manual IP entry (auto-discovery Phase 2)
  - No cloud upload yet (Phase 2)
  - JPEG only (RAW download Phase 2?)

**Shippable Increment:**
✅ Fully tested and verified working
✅ Documentation complete
✅ Ready for real event testing
✅ Known limitations documented

**Acceptance Criteria:**
- All 13 test cases pass
- Changelog updated
- Quick start guide created
- Ready to ship MVP

---

## File Structure After Implementation

```
apps/studio/SabaiPicsStudio/
├── SabaiPicsStudio.xcodeproj
├── SabaiPicsStudio-Bridging-Header.h          [NEW]
├── WiFiCameraManager.h                         [NEW]
├── WiFiCameraManager.m                         [NEW]
├── WiFiCameraService.swift                     [NEW]
├── WiFiSetupView.swift                         [NEW]
├── PhotoListRow.swift                          [NEW]
├── CameraViewModel.swift                       [UPDATED - WiFi support]
├── ContentView.swift                           [UPDATED - WiFi flow]
├── LiveCaptureView.swift                       [UPDATED - list view]
├── CameraService.swift                         [DISABLED - USB legacy]
├── SearchingView.swift                         [DISABLED - USB legacy]
├── CameraFoundView.swift                       [DISABLED - USB legacy]
└── Frameworks/
    └── GPhoto2.xcframework                     [NEW]
```

**New files:** ~700 lines
**Updated files:** ~120 lines
**Total:** ~820 lines

---

## Progress Tracking

Use this checklist to track overall progress:

### Implementation Progress
- [x] Phase 1: Framework Setup & Bridge Foundation (2h) ✅
- [x] Phase 2: WiFi Connection (Canon Only) (2h) ✅
- [x] Phase 3: Photo Event Monitoring (2h) ✅
- [x] Phase 4: Photo Download (JPEG Only) (2h) ✅
- [x] Phase 5: Connection UX & Permission Flow (4h) ✅
- [ ] Phase 6: List View UI (1.5h)
- [ ] Phase 7: Session Management (1.5h)
- [ ] Phase 8: Polish & Error Handling (2h)
- [ ] Phase 9: Final Testing & Documentation (1h)

**Total Time:** 17 hours (updated with Phase 5)
**Completed:** 12 hours | **Remaining:** 5 hours

### Milestone Checkpoints
- [x] **Milestone 1:** Project builds with GPhoto2 (after Phase 1) ✅
- [x] **Milestone 2:** Can connect to Canon camera (after Phase 2) ✅
- [x] **Milestone 3:** Can detect new photos (after Phase 3) ✅
- [x] **Milestone 4:** Photos auto-download and display (after Phase 4) ✅
- [ ] **Milestone 5:** Premium connection UX (after Phase 5)
- [ ] **Milestone 6:** Professional list UI complete (after Phase 6)
- [ ] **Milestone 7:** Full session flow works (after Phase 7)
- [ ] **Milestone 8:** Production-ready polish (after Phase 8)
- [ ] **Milestone 9:** MVP shipped! (after Phase 9)

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GPhoto2 build issues | Medium | High | Test Phase 1 first, use GPhoto2Example as reference |
| Canon connection fails | Low | High | Tested in GPhoto2Example already |
| Event monitoring unreliable | Low | Medium | Proven working in test app |
| Download too slow | Low | Low | WiFi ~5 MB/s, acceptable |
| Memory leaks | Medium | High | Test with Instruments in Phase 7 |
| iPad WiFi disconnect | Medium | Medium | Handle in error cases, allow reconnect |

---

## Phase 2 (Future) - Scope

**Not included in MVP, but planned:**

1. **Multi-brand support** (Nikon, Sony, Fujifilm)
   - Add brand selection UI
   - Add model string mappings
   - Add brand-specific instructions

2. **Auto-discovery** (UPnP/SSDP)
   - Requires Apple multicast entitlement
   - Automatic camera detection
   - Zero-config setup

3. **Cloud upload**
   - Upload to SabaiPics cloud after download
   - Background upload queue
   - Upload progress tracking

4. **Advanced features**
   - RAW file download option
   - Manual photo selection
   - Delete from camera after upload
   - Event/album organization

---

## Success Criteria

**MVP is successful if:**
- ✅ App runs on iPad with Canon camera
- ✅ WiFi connection works reliably
- ✅ Photos appear in app within 5 seconds of capture
- ✅ JPEG-only download works correctly
- ✅ No crashes during 30-minute event session
- ✅ Photographer can use it at real event
- ✅ Ready to demo to stakeholders

**Ready for production if:**
- ✅ All 8 phases complete
- ✅ All test checklists pass
- ✅ No critical bugs
- ✅ Documentation complete
- ✅ Field tested at 1 real event

---

## Next Steps

**Ready to start?**

1. ✅ All architecture decisions finalized
2. ✅ Canon-only scope confirmed
3. ✅ Plan written with checkboxes
4. ⏭️ **Start Phase 1: Framework Setup**

**Let's begin!** 🚀

Type "start phase 1" when ready to implement.
