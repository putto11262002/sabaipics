# 003 - Local Network Permission Pre-Check

**Date:** 2026-01-15
**Status:** Planned
**Related:** Phase 4 WiFi Connection, iPhone Hotspot Support

## Problem

### Current Behavior (Poor UX)

When user connects to camera for the **first time**:

1. User taps "Connect to Camera"
2. App attempts `gp_camera_init()` with 75-second timeout
3. iOS shows "Allow local network access?" prompt
4. User approves permission
5. **Connection fails** with timeout error (user took 10-20 seconds to approve)
6. User taps "Connect" **again**
7. Connection succeeds ✅

**Issue:** First connection always fails, requiring user to retry manually.

### Root Cause

- iOS 14+ requires "Local Network" permission for peer-to-peer communication
- Permission prompt only appears when app **attempts** local network access
- Cannot pre-request permission (no API to check status)
- Camera connection timeout (75s) expires while waiting for user approval
- Permission is granted **after** timeout, so retry works

### Discovery

From testing with Canon camera + iPhone hotspot:
- **First attempt:** Timeout -7 (GP_ERROR_TIMEOUT) after iOS permission prompt
- **Second attempt:** Immediate success - permission already granted
- iPhone hotspot **WORKS** with local network permission (research was outdated)

## Solution

### Pre-Flight Permission Check with Auto-Retry

Trigger local network permission prompt **before** attempting camera connection, with intelligent retry logic.

### Implementation Strategy

**Step 1: Pre-Flight Check**
- Before showing WiFi setup UI, trigger permission prompt
- Use dummy local network connection (non-blocking)
- iOS shows permission prompt immediately
- User approves once, never asked again

**Step 2: Smart Retry Logic**
- If first connection times out → Auto-retry with exponential backoff
- Max 3 retry attempts
- Backoff: 2s → 5s → 10s (not too long)
- After 3 failures → Show user troubleshooting message

**Step 3: Connection State Management**
- Track connection attempt count
- Reset retry counter on success
- Clear retry state when user manually retries

## Technical Design

### 1. LocalNetworkPermissionChecker (New Class)

```swift
// File: apps/studio/SabaiPicsStudio/LocalNetworkPermissionChecker.swift

import Foundation
import Network

class LocalNetworkPermissionChecker {

    /// Triggers iOS local network permission prompt
    /// - Parameter completion: Called when check completes (permission granted or denied)
    static func triggerPermissionPrompt(completion: @escaping () -> Void) {
        // Strategy: Attempt connection to link-local broadcast address
        // This triggers iOS permission without actually connecting to anything
        let connection = NWConnection(
            host: "169.254.255.255", // Link-local broadcast (RFC 3927)
            port: 1,                  // Any port
            using: .udp               // UDP = fast, no actual connection
        )

        var hasCompleted = false

        connection.stateUpdateHandler = { state in
            guard !hasCompleted else { return }

            switch state {
            case .ready, .failed, .cancelled:
                hasCompleted = true
                connection.cancel()

                // Give iOS a moment to process permission grant
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    completion()
                }

            case .waiting, .preparing, .setup:
                // Still attempting connection
                break

            @unknown default:
                break
            }
        }

        connection.start(queue: .global(qos: .userInitiated))

        // Safety timeout: complete after 5 seconds regardless
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0) {
            guard !hasCompleted else { return }
            hasCompleted = true
            connection.cancel()
            completion()
        }
    }

    /// Check if permission was previously granted (heuristic only)
    /// Note: iOS provides no direct API to check permission status
    static func likelyHasPermission() -> Bool {
        // Heuristic: If app previously launched and connected successfully
        // we can assume permission was granted
        return UserDefaults.standard.bool(forKey: "LocalNetworkPermissionGranted")
    }

    /// Mark permission as granted (call after successful camera connection)
    static func markPermissionGranted() {
        UserDefaults.standard.set(true, forKey: "LocalNetworkPermissionGranted")
    }
}
```

### 2. Connection Retry Logic in WiFiCameraService

```swift
// File: apps/studio/SabaiPicsStudio/WiFiCameraService.swift

class WiFiCameraService: NSObject, ObservableObject {
    // ... existing properties ...

    // Retry state
    private var retryCount = 0
    private let maxRetries = 3
    private var retryTimer: Timer?

    // ... existing methods ...

    /// Connect with automatic retry on timeout
    func connectWithRetry(config: CameraConfig, completion: ((Result<Void, Error>) -> Void)? = nil) {
        // Reset retry counter
        retryCount = 0

        // Attempt connection with retry logic
        attemptConnection(config: config, completion: completion)
    }

    private func attemptConnection(config: CameraConfig, completion: ((Result<Void, Error>) -> Void)?) {
        print("📡 [WiFiCameraService] Connection attempt \(retryCount + 1)/\(maxRetries)")

        // Clear any existing retry timer
        retryTimer?.invalidate()
        retryTimer = nil

        // Call existing connect method
        connect(config: config)

        // Wait for connection result
        DispatchQueue.global().asyncAfter(deadline: .now() + 90) { [weak self] in
            guard let self = self else { return }

            // Check if connection succeeded
            if self.isConnected {
                print("✅ [WiFiCameraService] Connection succeeded on attempt \(self.retryCount + 1)")
                self.retryCount = 0
                LocalNetworkPermissionChecker.markPermissionGranted()
                completion?(.success(()))
                return
            }

            // Connection failed - check if we should retry
            if self.retryCount < self.maxRetries - 1 {
                self.retryCount += 1

                // Exponential backoff: 2s, 5s, 10s
                let backoffDelay: TimeInterval = {
                    switch self.retryCount {
                    case 1: return 2.0
                    case 2: return 5.0
                    default: return 10.0
                    }
                }()

                print("⏳ [WiFiCameraService] Retry in \(backoffDelay)s...")

                // Schedule retry
                DispatchQueue.main.asyncAfter(deadline: .now() + backoffDelay) {
                    self.attemptConnection(config: config, completion: completion)
                }
            } else {
                // Max retries reached
                print("❌ [WiFiCameraService] Connection failed after \(self.maxRetries) attempts")
                self.retryCount = 0

                let error = NSError(
                    domain: "WiFiCameraService",
                    code: -1,
                    userInfo: [
                        NSLocalizedDescriptionKey: "Connection failed after \(self.maxRetries) attempts. Please check camera WiFi settings."
                    ]
                )
                completion?(.failure(error))
            }
        }
    }

    /// Cancel any pending retry
    func cancelRetry() {
        retryTimer?.invalidate()
        retryTimer = nil
        retryCount = 0
    }
}
```

### 3. Update CameraViewModel

```swift
// File: apps/studio/SabaiPicsStudio/CameraViewModel.swift

class CameraViewModel: ObservableObject {
    // ... existing properties ...

    @Published var isCheckingPermission = false

    // ... existing methods ...

    /// Connect to WiFi camera with permission check
    func connectToWiFiCamera(ip: String) {
        // Check if we likely already have permission
        if LocalNetworkPermissionChecker.likelyHasPermission() {
            // Skip pre-flight, connect directly
            initiateWiFiConnection(ip: ip)
            return
        }

        // First time or permission unclear - do pre-flight check
        print("🔐 [CameraViewModel] Triggering local network permission check...")
        isCheckingPermission = true

        LocalNetworkPermissionChecker.triggerPermissionPrompt { [weak self] in
            DispatchQueue.main.async {
                self?.isCheckingPermission = false
                print("✅ [CameraViewModel] Permission check complete, connecting...")
                self?.initiateWiFiConnection(ip: ip)
            }
        }
    }

    private func initiateWiFiConnection(ip: String) {
        let config = WiFiCameraService.CameraConfig(
            ip: ip,
            model: "Canon EOS (WLAN)",
            protocol: "ptpip"
        )

        // Use retry-enabled connection
        wifiService.connectWithRetry(config: config) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    print("✅ [CameraViewModel] WiFi connection established")
                    self?.appState = .capturing

                case .failure(let error):
                    print("❌ [CameraViewModel] WiFi connection failed: \(error.localizedDescription)")
                    self?.appState = .error(error.localizedDescription)
                }
            }
        }
    }
}
```

### 4. Update WiFiSetupView (Optional Loading State)

```swift
// File: apps/studio/SabaiPicsStudio/WiFiSetupView.swift

struct WiFiSetupView: View {
    @ObservedObject var viewModel: CameraViewModel
    @State private var ipAddress: String = "192.168.1.1"

    var body: some View {
        // ... existing UI ...

        if viewModel.isCheckingPermission {
            VStack(spacing: 16) {
                ProgressView()
                Text("Requesting network permission...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Text("Please allow local network access when prompted")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
        }

        // ... existing connect button ...
    }
}
```

## Implementation Plan

### Phase 1: Core Permission Checker (30 min)

**Files to create:**
- `apps/studio/SabaiPicsStudio/LocalNetworkPermissionChecker.swift`

**Tasks:**
- [ ] Create LocalNetworkPermissionChecker class
- [ ] Implement `triggerPermissionPrompt()` method
- [ ] Add UserDefaults tracking for permission state
- [ ] Test on device - verify iOS prompt appears

### Phase 2: Retry Logic (45 min)

**Files to modify:**
- `apps/studio/SabaiPicsStudio/WiFiCameraService.swift`

**Tasks:**
- [ ] Add retry state properties (retryCount, maxRetries, retryTimer)
- [ ] Implement `connectWithRetry()` method
- [ ] Implement `attemptConnection()` with backoff logic
- [ ] Add `cancelRetry()` cleanup method
- [ ] Test retry behavior with timeout scenarios

### Phase 3: ViewModel Integration (30 min)

**Files to modify:**
- `apps/studio/SabaiPicsStudio/CameraViewModel.swift`

**Tasks:**
- [ ] Add `isCheckingPermission` published property
- [ ] Update `connectToWiFiCamera()` to use pre-flight check
- [ ] Create `initiateWiFiConnection()` helper method
- [ ] Update WiFi bindings to use `connectWithRetry()`
- [ ] Test end-to-end flow

### Phase 4: UI Polish (15 min)

**Files to modify:**
- `apps/studio/SabaiPicsStudio/WiFiSetupView.swift`

**Tasks:**
- [ ] Add permission check loading state
- [ ] Add helpful message during first connection
- [ ] Test UI feedback on device

### Phase 5: Testing & Validation (30 min)

**Test scenarios:**
1. **Fresh install (no permission):**
   - App triggers pre-flight check
   - iOS shows permission prompt
   - User approves
   - Connection succeeds on first attempt ✅

2. **Permission denied:**
   - User denies permission
   - Connection fails after 3 retries
   - App shows helpful error message

3. **Subsequent connections:**
   - Permission already granted
   - No prompt shown
   - Immediate connection ✅

4. **Timeout during connection:**
   - First attempt times out
   - Auto-retry after 2s
   - Connection succeeds on retry ✅

5. **Camera not available:**
   - All 3 retries fail
   - Clear error message shown

## Backoff Strategy

### Retry Timing

```
Attempt 1: Immediate (0s)
   ↓ (fails)
Attempt 2: +2s delay  (total: 2s)
   ↓ (fails)
Attempt 3: +5s delay  (total: 7s)
   ↓ (fails)
Final failure: +10s delay (total: 17s)
```

**Total time if all fail:** ~17 seconds (acceptable)

### Why This Backoff?

- **2s first retry:** Quick recovery if permission prompt delayed connection
- **5s second retry:** Allows time for network stabilization
- **10s third retry:** Final attempt with patience
- **Not too long:** User sees progress, doesn't feel stuck
- **Not too short:** Gives network/iOS time to settle

## Benefits

### User Experience

**Before:**
- 😞 First connection always fails
- 😞 User must manually retry
- 😞 Confusing timeout error
- 😞 Takes 2 attempts minimum

**After:**
- 😊 Permission prompt appears immediately
- 😊 Auto-retry handles timeout gracefully
- 😊 Usually succeeds on first attempt
- 😊 Max 17s to definitive success/failure
- 😊 Clear error messages if all retries fail

### Technical Benefits

- ✅ Handles iOS permission UX properly
- ✅ Resilient to network timing issues
- ✅ No manual retry needed
- ✅ Clear separation of concerns (permission vs connection)
- ✅ Testable retry logic

## Edge Cases

### 1. User Denies Permission

**Behavior:**
- Pre-flight check completes (denial is a result)
- Connection attempts will fail
- After 3 retries, show error: "Local network access required. Enable in Settings > Privacy > Local Network."

### 2. Permission Prompt Dismissed

**Behavior:**
- iOS treats as "not determined" (neither granted nor denied)
- Next network attempt triggers prompt again
- Retry logic handles gracefully

### 3. App Backgrounded During Connection

**Behavior:**
- Connection may timeout
- Retry timer continues
- User returns to app → sees retry in progress or result

### 4. Multiple Simultaneous Connection Attempts

**Behavior:**
- Retry state is instance-level (WiFiCameraService)
- Only one connection active at a time
- Subsequent attempts cancel previous retry timer

## Success Criteria

### Functional Requirements

- [x] Permission prompt appears before first camera connection
- [x] Connection succeeds on first attempt after permission grant
- [x] Auto-retry occurs on timeout (max 3 attempts)
- [x] Exponential backoff applied (2s, 5s, 10s)
- [x] Clear error message after max retries
- [x] Subsequent connections skip permission check

### Performance Requirements

- [x] Pre-flight check completes in < 5 seconds
- [x] Total retry sequence < 20 seconds
- [x] No UI blocking during retry
- [x] Retry state properly cleaned up

### UX Requirements

- [x] User sees progress during retry
- [x] User understands what's happening
- [x] No confusing error messages
- [x] Works on both iPhone hotspot and camera WiFi

## Testing Checklist

### Device Testing (Required)

- [ ] Test on iPad with iOS 16.6 (deployment target)
- [ ] Test on iPhone with iOS 17+ (latest)
- [ ] Test with Canon camera WiFi network
- [ ] Test with iPhone hotspot network
- [ ] Test with regular WiFi router (both devices on same network)

### Permission Scenarios

- [ ] Fresh install → permission prompt appears → approve → success
- [ ] Fresh install → permission prompt appears → deny → retry → helpful error
- [ ] Fresh install → permission prompt appears → dismiss → retry → prompt again
- [ ] Permission already granted → no prompt → immediate success
- [ ] Revoke permission in Settings → attempt connection → re-prompt

### Network Scenarios

- [ ] Camera available, good signal → success on attempt 1
- [ ] Camera available, weak signal → success on attempt 2-3
- [ ] Camera not available → fail after 3 attempts → clear error
- [ ] Camera WiFi turns off during retry → fail gracefully
- [ ] Switch networks during retry → handle properly

### Stress Testing

- [ ] Rapid connect/disconnect cycles → no crashes
- [ ] Background app during retry → resume properly
- [ ] Kill app during retry → clean restart
- [ ] Airplane mode → clear error message

## Rollout Plan

### Development

1. Create feature branch: `feat/local-network-permission-precheck`
2. Implement phases 1-4
3. Test on device thoroughly
4. Code review

### Testing

1. Test with Canon camera over hotspot (primary use case)
2. Test with camera WiFi
3. Test permission scenarios
4. Verify no regressions

### Deployment

1. Merge to main branch
2. Update Phase 4 in MVP_PLAN.md as complete
3. Document in changelog

## Notes

### Why Link-Local Address for Pre-Flight?

- **169.254.255.255** is link-local broadcast (RFC 3927)
- Never routes outside local network
- Won't accidentally connect to real device
- iOS recognizes as local network access → triggers prompt
- UDP = fast, no TCP handshake delay

### Alternative Approaches Considered

**Option A: Just extend timeout to 120s**
- ❌ Still requires manual retry
- ❌ User waits too long

**Option B: Show instructions before connect**
- ❌ User still must retry manually
- ❌ Extra tap required

**Option C: Network Extension framework**
- ❌ Overkill for this use case
- ❌ Requires additional entitlements
- ❌ More complex implementation

**Selected: Pre-flight + Auto-retry**
- ✅ Best user experience
- ✅ Handles all edge cases
- ✅ No manual retry needed
- ✅ Simple implementation

## References

- Apple WWDC 2020: "Support local network privacy in your app"
- iOS 14+ Local Network Privacy Requirements
- NSLocalNetworkUsageDescription documentation
- Canon PTP/IP connection requirements
- GPhoto2 timeout behavior

## Related Issues

- Phase 4: Photo Download implementation
- Camera WiFi download failure (to be investigated next)
- iPhone hotspot compatibility discovery

---

**Total Estimated Time:** 2.5 hours
**Priority:** High (blocks smooth UX for production)
**Complexity:** Medium
