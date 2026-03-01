# 009 - Critical Bug Fixes

**Date**: 2026-01-18
**Status**: COMPLETED - Working on real device

## Summary

Fixed two critical bugs that were causing app crashes and UI unresponsiveness after disconnect:

1. **Thread race condition** causing `EXC_BAD_ACCESS` crashes
2. **iOS 17 RTI bug** causing TextField unresponsiveness (mitigated with custom alert)

## Bug 1: Thread Race Condition (EXC_BAD_ACCESS)

### Root Cause

When disconnecting from camera, the event monitoring background thread was still running while the camera resources were being freed, causing memory access violations.

**Crash location**: `CHECK_PTP_RC(params->sendreq_func (params, ptp, flags))`

**Sequence**:

```
Main Thread:                  Background Thread (event monitoring):
stopEventMonitoring()         [Running, polling for new photos]
  _isMonitoring = NO
  [thread cancel]             [Still running...]
gp_camera_free(_camera)       [Tries to send camera request]
_camera = NULL           <---- EXC_BAD_ACCESS (0x0)
```

### Fix

Added proper thread synchronization in `WiFiCameraManager.m:stopEventMonitoring`:

```objc
- (void)stopEventMonitoring {
    if (!_isMonitoring) {
        return;
    }

    NSLog(@"[WiFiCameraManager] Stopping event monitoring");
    _isMonitoring = NO;

    if (_monitoringThread) {
        [_monitoringThread cancel];

        // CRITICAL FIX: Wait for thread to actually finish
        NSLog(@"[WiFiCameraManager] Waiting for monitoring thread to finish...");
        while (!_monitoringThread.isFinished) {
            [NSThread sleepForTimeInterval:0.01]; // 10ms poll interval
        }
        NSLog(@"[WiFiCameraManager] Event monitoring thread stopped");

        _monitoringThread = nil;
    }
}
```

**Impact**:

- No more `EXC_BAD_ACCESS` crashes during disconnect
- Clean thread shutdown before resource cleanup
- Prevents state corruption

## Bug 2: iOS 17 RTI (RemoteTextInput) Bug

### Root Cause

iOS 17 has a known bug where `UITextField` doesn't properly deinit when removed from view hierarchy if it ever became first responder. This created orphaned RTI sessions.

**Error**: `-[RTIInputSystemClient remoteTextInputSessionWithID:performInputOperation:] perform input operation requires a valid sessionID`

**Sequence**:

1. WiFiSetupView TextField becomes first responder (keyboard opens)
2. User connects → navigate to LiveCaptureView
3. TextField doesn't deinit (iOS 17 bug) → orphaned RTI session
4. User taps Disconnect → native `.alert()` shows
5. Alert creates UIKit window → calls global `resignFirstResponder`
6. Tries to cleanup orphaned RTI session → **fails** → RTI corruption
7. Return to WiFiSetupView → TextField unresponsive

### Solution: Custom Pure SwiftUI Alert

Replaced native `.alert()` with custom SwiftUI overlay to avoid UIKit window management.

**Files Created**:

- `SabaiPicsStudio/Views/CustomConfirmationOverlay.swift` (192 lines)

**Files Modified**:

- `SabaiPicsStudio/ContentView.swift` - Uses `.customConfirmationDialog()` instead of `.alert()`
- `SabaiPicsStudio/Stores/AppCoordinator.swift` - Added `showDisconnectAlert` and disconnect methods
- `SabaiPicsStudio/LiveCaptureView.swift` - Delegates to coordinator, added `.onDisappear` cleanup
- `SabaiPicsStudio/Stores/ConnectionStore.swift` - Added `withAnimation` wrapper

**Why it works**:

- Native `.alert()` → UIKit window → global resignFirstResponder → RTI bug
- Custom overlay → Pure SwiftUI ZStack → No UIKit windows → No RTI trigger

**Impact**:

- WiFiSetupView TextField works after disconnect
- No RTI errors in console
- Cleaner, more maintainable code

## Additional Changes

### Emoji Removal

Removed all emojis from log statements (56 total across 8 files):

- `print()` statements in Swift
- `NSLog()` statements in Objective-C
- Kept all component names and messages intact

**Motivation**: Professional codebase, easier to grep/search logs

## Files Modified

### Objective-C

- `SabaiPicsStudio/WiFiCameraManager.m`
  - Fixed thread race condition in `stopEventMonitoring`
  - Removed emojis from logs

### Swift - New Files

- `SabaiPicsStudio/Views/CustomConfirmationOverlay.swift` (NEW)
  - Custom alert overlay component
  - View modifier `.customConfirmationDialog()`

### Swift - Modified

- `SabaiPicsStudio/ContentView.swift`
  - Replaced `.alert()` with `.customConfirmationDialog()`
  - Removed emojis

- `SabaiPicsStudio/Stores/AppCoordinator.swift`
  - Added `@Published var showDisconnectAlert`
  - Added `requestDisconnect()` method
  - Added `confirmDisconnect()` method
  - Removed emojis

- `SabaiPicsStudio/LiveCaptureView.swift`
  - Added `@EnvironmentObject var coordinator`
  - Changed Disconnect button to call `coordinator.requestDisconnect()`
  - Added `.onDisappear` cleanup
  - Removed emojis

- `SabaiPicsStudio/Stores/ConnectionStore.swift`
  - Added `withAnimation(.easeInOut)` around state change
  - Added `import SwiftUI`
  - Removed emojis

- `SabaiPicsStudio/Stores/PhotoStore.swift`
  - Removed emojis

- `SabaiPicsStudio/Services/WiFiCameraService.swift`
  - Removed emojis

- `SabaiPicsStudio/LocalNetworkPermissionChecker.swift`
  - Removed emojis

- `SabaiPicsStudio/CameraService.swift`
  - Removed emojis

## Testing Results

**Tested on**: Real iPhone with real Canon camera

**Results**:

- ✅ No crashes during disconnect
- ✅ No `EXC_BAD_ACCESS` errors
- ✅ No RTI errors in console
- ✅ WiFiSetupView TextField responsive after disconnect
- ✅ Connect → Capture photos → Disconnect → Reconnect flow works perfectly

## Technical Notes

### Thread Synchronization Pattern

The fix uses a busy-wait pattern which is appropriate here because:

1. Thread shutdown is fast (milliseconds)
2. Only happens during disconnect (infrequent)
3. 10ms poll interval is negligible
4. Simple and reliable

Alternative considered: `pthread_join` but NSThread doesn't expose the pthread handle cleanly.

### SwiftUI Alert Gotcha

This is a documented iOS 17 issue affecting multiple frameworks:

- React Native (GitHub issue #41801)
- SwiftUI (Apple Developer Forums FB13727682)
- Compose Multiplatform

**Standard workaround**: Custom modals/overlays instead of native alerts when text input is involved.

## Related Documentation

- `DISCONNECT_BUG_FIX.md` - Detailed investigation of orphaned alert overlay
- `CUSTOM_ALERT_IMPLEMENTATION.md` - Pure SwiftUI alert documentation
- `ALERT_OVERLAY_BUG_ANALYSIS.md` - Root cause analysis from subagents

## Next Steps

Both critical bugs are now fixed and tested on real hardware. Ready for next feature implementation.
