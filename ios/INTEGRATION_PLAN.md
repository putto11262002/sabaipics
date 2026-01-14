# WiFi Integration Plan: GPhoto2Framework → SabaiPicsStudio

**Date:** 2026-01-14
**Status:** Awaiting user approval
**Estimated Time:** 8-12 hours

---

## Executive Summary

This document outlines the integration plan to bring WiFi photo capture capabilities from the proven GPhoto2Example into the production SabaiPicsStudio app.

**What we've proven:**
- ✅ GPhoto2Framework successfully detects Canon cameras via WiFi (PTP/IP protocol)
- ✅ Event monitoring (`GP_EVENT_FILE_ADDED`) detects new photos in real-time
- ✅ Camera operates normally (shutter button works, LCD stays on)
- ✅ Tested and confirmed working on iPad with Canon camera

**What we're integrating:**
- GPhoto2Framework (Objective-C) → SabaiPicsStudio (Swift)
- WiFi camera detection and connection
- Real-time photo event monitoring
- Automatic photo download via WiFi

---

## Architecture Decisions (NEED YOUR INPUT)

### Decision 1: Keep USB Code or Remove?

<mark data-comment="1">**Option A: Keep Both Modes (Parallel)**</mark>
<!-- COMMENT-1: And we keep both but diable usb for now. Just focus on wifi? -->
- Pros:
  - Flexibility for users with different cameras
  - USB code is already written and tested
  - May be useful for future debug/comparison
- Cons:
  - More complex state management
  - Two connection modes to maintain
  - USB doesn't meet core requirement (shutter blocked)

**Option B: WiFi Only (Recommended)**
- Pros:
  - Simpler codebase
  - Focused on what actually works
  - USB code can be git-archived if needed later
- Cons:
  - Removes optionality
  - USB code deletion is permanent (unless recovered from git)

**Your Choice:** [ A / B / Other ]

---

### Decision 2: Objective-C Bridge Strategy

**Option A: Thin Wrapper**
```objc
// Just expose minimal C/Objective-C functions to Swift
@interface WiFiCameraWrapper : NSObject
- (int)connectToCamera:(NSString*)ip model:(NSString*)model;
- (void)startEventMonitoring;
@end
```
- Pros: Simple, minimal code
- Cons: Swift code has to handle more low-level details

<mark data-comment="2">**Option B: Full Service Layer (Recommended)**</mark>
<!-- COMMENT-2: This seems better OK -->
```objc
// Complete service with delegates and state management
@protocol WiFiCameraManagerDelegate
- (void)cameraManager:(WiFiCameraManager*)manager didDetectNewPhoto:(NSString*)filename;
@end

@interface WiFiCameraManager : NSObject
@property (weak) id<WiFiCameraManagerDelegate> delegate;
- (BOOL)connectWithIP:(NSString*)ip model:(NSString*)model error:(NSError**)error;
- (void)downloadPhoto:(NSString*)filename toPath:(NSURL*)destination;
@end
```
- Pros: Clean separation, Swift doesn't touch C code, professional architecture
- Cons: More code upfront (but cleaner long-term)

**Your Choice:** [ A / B ]

---

<mark data-comment="6">### Decision 3: UI/UX Flow</mark>
<!-- COMMENT-6: Yes but use all swift ui make it look nice this current exmaple one is just shit that is all. So for ip address prompt use dialog right then connect loading dialoig? error back to enter ip?

Also i see it can connect to differnt camera e..g nikkon cannon ... how does that differ. Should we show nice ui to select? as a flow e.g. page i what cam then ip? -->

**Option A: Simple WiFi-Only Flow (Recommended for MVP)**
```
App Launch
  ↓
Enter Camera IP (text field with "192.168.1.1" default)
  ↓
Connect
  ↓
Live Capture View (same as current)
```

**Option B: Mode Picker First**
```
App Launch
  ↓
Choose Mode: [USB] [WiFi]
  ↓
(USB: Search for cameras like before)
(WiFi: Enter IP screen)
  ↓
Live Capture View
```

**Your Choice:** [ A / B / Other ]

---

### Decision 4: Photo Download Strategy

**Option A: Detect Only (Manual Download)**
- When `GP_EVENT_FILE_ADDED` fires, add to list
- User taps photo to download
- Pros: Less data transfer, user control
- Cons: Extra step, not "automatic"

<mark data-comment="3">**Option B: Download Immediately (Recommended)**</mark>
<!-- COMMENT-3: Yes download to local store for now OK -->
<mark data-comment="4">- When `GP_EVENT_FILE_ADDED` fires, auto-download photo</mark>
<!-- COMMENT-4: Done use grid use list ok -->
<mark data-comment="5">- Show in grid as soon as downloaded</mark>
<!-- COMMENT-5: Also only jpeg is download if raw we show wanring to set to jepg or jefp + raw. WE can determines this? -->
- Pros: Fully automatic, matches original vision
- Cons: More network traffic (but WiFi should be fast enough)

**Your Choice:** [ A / B ]

---

### Decision 5: State Management

**Option A: New WiFiCameraViewModel**
- Create separate `WiFiCameraViewModel.swift`
- Keep `CameraViewModel.swift` for USB
- Switch between them in ContentView

<mark data-comment="7">**Option B: Unified ViewModel (Recommended)**</mark>
<!-- COMMENT-7: I quesss unified what do you think? -->
- Update existing `CameraViewModel.swift` to support both modes
- Add `connectionMode` enum: `.usb` or `.wifi`
- Single source of truth for app state

**Your Choice:** [ A / B ]

---

### Decision 6: Existing USB Code

**Option A: Delete USB Code Entirely**
- Clean slate, no confusion
- Can recover from git if needed

<mark data-comment="8">**Option B: Disable USB Code (Recommended)**</mark>
<!-- COMMENT-8: Disable borther -->
- Comment out or `#if false` USB connection logic
- Keep as reference for learning/comparison
- Remove in future cleanup sprint

**Your Choice:** [ A / B ]

---

## Implementation Plan (7 Phases)

### Phase 1: Framework Setup (1 hour)

**Tasks:**
1. Add GPhoto2Framework to SabaiPicsStudio project
   - Drag `GPhoto2Framework/GPhoto2.xcframework` into Xcode
   - Add to "Frameworks, Libraries, and Embedded Content"
   - Set "Embed & Sign"

2. Create bridging header
   ```
   apps/studio/SabaiPicsStudio-Bridging-Header.h
   ```
   ```objc
   #import <GPhoto2/gphoto2.h>
   ```

3. Verify build
   ```bash
   cd apps/studio
   xcodebuild -project SabaiPicsStudio.xcodeproj -scheme SabaiPicsStudio build
   ```

**Acceptance:**
- ✅ Project builds with GPhoto2Framework linked
- ✅ No linker errors
- ✅ Bridge header found by Swift compiler

---

### Phase 2: Objective-C Bridge (2 hours)

**Create:** `WiFiCameraManager.h`
```objc
#import <Foundation/Foundation.h>

typedef NS_ENUM(NSInteger, WiFiCameraConnectionState) {
    WiFiCameraConnectionStateDisconnected,
    WiFiCameraConnectionStateConnecting,
    WiFiCameraConnectionStateConnected,
    WiFiCameraConnectionStateError
};

@protocol WiFiCameraManagerDelegate <NSObject>
- (void)cameraManagerDidConnect:(id)manager;
- (void)cameraManager:(id)manager didFailWithError:(NSError*)error;
- (void)cameraManager:(id)manager didDetectNewPhoto:(NSString*)filename folder:(NSString*)folder;
- (void)cameraManager:(id)manager didDownloadPhoto:(NSData*)photoData filename:(NSString*)filename;
@end

@interface WiFiCameraManager : NSObject

@property (nonatomic, weak) id<WiFiCameraManagerDelegate> delegate;
@property (nonatomic, readonly) WiFiCameraConnectionState connectionState;
@property (nonatomic, readonly) NSString *cameraIP;
@property (nonatomic, readonly) NSString *cameraModel;

// Connection
- (BOOL)connectWithIP:(NSString*)ip
               model:(NSString*)model
            protocol:(NSString*)protocol
               error:(NSError**)error;
- (void)disconnect;

// Monitoring
- (void)startEventMonitoring;
- (void)stopEventMonitoring;

// Photo operations
- (void)downloadPhotoAtPath:(NSString*)folder
                   filename:(NSString*)filename
                 completion:(void(^)(NSData* _Nullable photoData, NSError* _Nullable error))completion;

@end
```

**Create:** `WiFiCameraManager.m`
```objc
#import "WiFiCameraManager.h"
#import <GPhoto2/gphoto2.h>

@interface WiFiCameraManager ()
@property (nonatomic, assign) Camera *camera;
@property (nonatomic, assign) GPContext *context;
@property (nonatomic, assign) BOOL isMonitoring;
@property (nonatomic, strong) NSThread *monitoringThread;
@end

@implementation WiFiCameraManager

- (instancetype)init {
    if (self = [super init]) {
        _connectionState = WiFiCameraConnectionStateDisconnected;
        _camera = NULL;
        _context = gp_context_new();
        _isMonitoring = NO;
    }
    return self;
}

- (BOOL)connectWithIP:(NSString*)ip
               model:(NSString*)model
            protocol:(NSString*)protocol
               error:(NSError**)error {

    _connectionState = WiFiCameraConnectionStateConnecting;
    _cameraIP = ip;
    _cameraModel = model;

    int ret;
    GPPortInfoList *portinfolist;
    GPPortInfo pi;
    CameraAbilitiesList *abilities;
    CameraAbilities a;

    // Create camera
    ret = gp_camera_new(&_camera);
    if (ret != GP_OK) {
        [self setError:error message:@"Failed to create camera" code:ret];
        return NO;
    }

    // Load abilities
    ret = gp_abilities_list_new(&abilities);
    ret = gp_abilities_list_load(abilities, _context);
    int modelIndex = gp_abilities_list_lookup_model(abilities, [model UTF8String]);
    ret = gp_abilities_list_get_abilities(abilities, modelIndex, &a);
    ret = gp_camera_set_abilities(_camera, a);
    gp_abilities_list_free(abilities);

    // Set port
    ret = gp_port_info_list_new(&portinfolist);
    ret = gp_port_info_list_load(portinfolist);
    NSString *connectionStr = [NSString stringWithFormat:@"%@:%@", protocol, ip];
    int portIndex = gp_port_info_list_lookup_path(portinfolist, [connectionStr UTF8String]);
    ret = gp_port_info_list_get_info(portinfolist, portIndex, &pi);
    ret = gp_camera_set_port_info(_camera, pi);
    gp_port_info_list_free(portinfolist);

    // Initialize camera
    ret = gp_camera_init(_camera, _context);
    if (ret != GP_OK) {
        [self setError:error message:@"Failed to initialize camera" code:ret];
        _connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    _connectionState = WiFiCameraConnectionStateConnected;

    dispatch_async(dispatch_get_main_queue(), ^{
        if ([self.delegate respondsToSelector:@selector(cameraManagerDidConnect:)]) {
            [self.delegate cameraManagerDidConnect:self];
        }
    });

    return YES;
}

- (void)startEventMonitoring {
    if (_isMonitoring || _connectionState != WiFiCameraConnectionStateConnected) {
        return;
    }

    _isMonitoring = YES;
    _monitoringThread = [[NSThread alloc] initWithTarget:self
                                                selector:@selector(monitoringLoop)
                                                  object:nil];
    [_monitoringThread start];
}

- (void)monitoringLoop {
    NSLog(@"📡 Event monitoring started");

    while (_isMonitoring && [[NSThread currentThread] isCancelled] == NO) {
        CameraEventType evttype;
        void *evtdata;

        int ret = gp_camera_wait_for_event(_camera, 1000, &evttype, &evtdata, _context);

        if (ret == GP_OK && evttype == GP_EVENT_FILE_ADDED) {
            CameraFilePath *path = (CameraFilePath*)evtdata;
            NSString *filename = [NSString stringWithUTF8String:path->name];
            NSString *folder = [NSString stringWithUTF8String:path->folder];

            NSLog(@"📸 NEW PHOTO: %@ in %@", filename, folder);

            dispatch_async(dispatch_get_main_queue(), ^{
                if ([self.delegate respondsToSelector:@selector(cameraManager:didDetectNewPhoto:folder:)]) {
                    [self.delegate cameraManager:self didDetectNewPhoto:filename folder:folder];
                }
            });
        }
    }

    NSLog(@"📡 Event monitoring stopped");
}

- (void)downloadPhotoAtPath:(NSString*)folder
                   filename:(NSString*)filename
                 completion:(void(^)(NSData* _Nullable, NSError* _Nullable))completion {

    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        CameraFile *file;
        int ret;

        ret = gp_file_new(&file);
        if (ret != GP_OK) {
            NSError *error = [NSError errorWithDomain:@"GPhoto2" code:ret userInfo:nil];
            dispatch_async(dispatch_get_main_queue(), ^{ completion(nil, error); });
            return;
        }

        ret = gp_camera_file_get(self.camera,
                                 [folder UTF8String],
                                 [filename UTF8String],
                                 GP_FILE_TYPE_NORMAL,
                                 file,
                                 self.context);

        if (ret != GP_OK) {
            gp_file_free(file);
            NSError *error = [NSError errorWithDomain:@"GPhoto2" code:ret userInfo:nil];
            dispatch_async(dispatch_get_main_queue(), ^{ completion(nil, error); });
            return;
        }

        const char *data;
        unsigned long size;
        ret = gp_file_get_data_and_size(file, &data, &size);

        NSData *photoData = [NSData dataWithBytes:data length:size];
        gp_file_free(file);

        dispatch_async(dispatch_get_main_queue(), ^{
            completion(photoData, nil);

            if ([self.delegate respondsToSelector:@selector(cameraManager:didDownloadPhoto:filename:)]) {
                [self.delegate cameraManager:self didDownloadPhoto:photoData filename:filename];
            }
        });
    });
}

- (void)stopEventMonitoring {
    _isMonitoring = NO;
    [_monitoringThread cancel];
}

- (void)disconnect {
    [self stopEventMonitoring];

    if (_camera) {
        gp_camera_exit(_camera, _context);
        gp_camera_free(_camera);
        _camera = NULL;
    }

    _connectionState = WiFiCameraConnectionStateDisconnected;
}

- (void)setError:(NSError**)error message:(NSString*)message code:(int)code {
    if (error) {
        *error = [NSError errorWithDomain:@"GPhoto2"
                                     code:code
                                 userInfo:@{NSLocalizedDescriptionKey: message}];
    }
}

- (void)dealloc {
    [self disconnect];
    if (_context) {
        gp_context_unref(_context);
    }
}

@end
```

**Acceptance:**
- ✅ Bridge compiles without errors
- ✅ All GPhoto2 functions wrapped cleanly
- ✅ Delegate pattern ready for Swift

---

### Phase 3: Swift Service Layer (2 hours)

**Create:** `WiFiCameraService.swift`
```swift
import Foundation
import Combine

/// Swift wrapper around WiFiCameraManager (Objective-C bridge)
class WiFiCameraService: NSObject, ObservableObject {
    // MARK: - Published Properties
    @Published var isConnected: Bool = false
    @Published var connectionError: String? = nil
    @Published var detectedPhotos: [(filename: String, folder: String)] = []

    // MARK: - Private Properties
    private let manager: WiFiCameraManager
    private var downloadQueue: OperationQueue

    // MARK: - Configuration
    struct CameraConfig {
        let ip: String
        let model: String
        let protocol: String

        static let canonWiFi = CameraConfig(
            ip: "192.168.1.1",
            model: "Canon EOS (WLAN)",
            protocol: "ptpip"
        )
    }

    // MARK: - Initialization
    override init() {
        self.manager = WiFiCameraManager()
        self.downloadQueue = OperationQueue()
        self.downloadQueue.maxConcurrentOperationCount = 1 // Download one at a time
        super.init()

        self.manager.delegate = self
    }

    // MARK: - Public Methods
    func connect(config: CameraConfig = .canonWiFi) {
        print("📱 Connecting to WiFi camera: \(config.ip)")

        var error: NSError?
        let success = manager.connect(
            withIP: config.ip,
            model: config.model,
            protocol: config.protocol,
            error: &error
        )

        if !success {
            self.connectionError = error?.localizedDescription ?? "Unknown error"
            self.isConnected = false
        }
    }

    func disconnect() {
        print("📱 Disconnecting from WiFi camera")
        manager.disconnect()
        isConnected = false
    }

    func startMonitoring() {
        print("📡 Starting event monitoring")
        manager.startEventMonitoring()
    }

    func stopMonitoring() {
        print("📡 Stopping event monitoring")
        manager.stopEventMonitoring()
    }

    func downloadPhoto(filename: String, folder: String, completion: @escaping (Result<Data, Error>) -> Void) {
        downloadQueue.addOperation { [weak self] in
            guard let self = self else { return }

            let semaphore = DispatchSemaphore(value: 0)
            var result: Result<Data, Error>?

            self.manager.downloadPhoto(atPath: folder, filename: filename) { data, error in
                if let error = error {
                    result = .failure(error)
                } else if let data = data {
                    result = .success(data)
                }
                semaphore.signal()
            }

            semaphore.wait()

            if let result = result {
                DispatchQueue.main.async {
                    completion(result)
                }
            }
        }
    }
}

// MARK: - WiFiCameraManagerDelegate
extension WiFiCameraService: WiFiCameraManagerDelegate {
    func cameraManagerDidConnect(_ manager: Any) {
        print("✅ Connected to camera via WiFi")
        DispatchQueue.main.async {
            self.isConnected = true
            self.connectionError = nil
        }
    }

    func cameraManager(_ manager: Any, didFailWithError error: Error) {
        print("❌ Camera connection failed: \(error.localizedDescription)")
        DispatchQueue.main.async {
            self.isConnected = false
            self.connectionError = error.localizedDescription
        }
    }

    func cameraManager(_ manager: Any, didDetectNewPhoto filename: String, folder: String) {
        print("📸 New photo detected: \(filename)")
        DispatchQueue.main.async {
            self.detectedPhotos.append((filename: filename, folder: folder))
        }
    }

    func cameraManager(_ manager: Any, didDownloadPhoto photoData: Data, filename: String) {
        print("✅ Photo downloaded: \(filename), size: \(photoData.count) bytes")
        // This delegate method is called after download completes
        // Additional processing can be done here if needed
    }
}
```

**Acceptance:**
- ✅ Swift compiles with Objective-C bridge
- ✅ Published properties work with Combine
- ✅ Connection/disconnection works
- ✅ Photo detection events fire

---

### Phase 4: Update ViewModel (1 hour)

**Update:** `CameraViewModel.swift`

Add WiFi support to existing ViewModel:

```swift
// Add to top of file
import Combine

// Add WiFi service
class CameraViewModel: NSObject, ObservableObject {
    // ... existing properties ...

    // MARK: - WiFi Properties
    private let wifiService: WiFiCameraService
    private var wifiCancellables = Set<AnyCancellable>()

    // MARK: - Connection Mode
    enum ConnectionMode {
        case usb
        case wifi
    }
    @Published var connectionMode: ConnectionMode = .wifi // Default to WiFi

    override init() {
        self.cameraService = CameraService() // USB (legacy)
        self.wifiService = WiFiCameraService() // WiFi (new)
        super.init()
        setupBindings()
        setupWiFiBindings()
        startSearching()
    }

    private func setupWiFiBindings() {
        // Listen to WiFi connection state
        wifiService.$isConnected
            .sink { [weak self] connected in
                guard let self = self else { return }
                if connected {
                    print("✅ WiFi camera connected - starting monitoring")
                    self.wifiService.startMonitoring()
                    self.appState = .capturing
                }
            }
            .store(in: &wifiCancellables)

        // Listen to WiFi connection errors
        wifiService.$connectionError
            .compactMap { $0 }
            .sink { [weak self] error in
                self?.appState = .error(error)
            }
            .store(in: &wifiCancellables)

        // Listen to detected photos
        wifiService.$detectedPhotos
            .sink { [weak self] photos in
                guard let self = self else { return }

                // Download each new photo
                for (filename, folder) in photos {
                    self.downloadingCount += 1

                    self.wifiService.downloadPhoto(filename: filename, folder: folder) { result in
                        self.downloadingCount -= 1

                        switch result {
                        case .success(let data):
                            let photo = CapturedPhoto(name: filename, data: data)
                            self.capturedPhotos.insert(photo, at: 0)
                            self.photoCount = self.capturedPhotos.count
                            print("✅ Photo added to grid: \(filename)")

                        case .failure(let error):
                            print("❌ Download failed: \(error.localizedDescription)")
                        }
                    }
                }

                // Clear detected photos after processing
                self.wifiService.detectedPhotos.removeAll()
            }
            .store(in: &wifiCancellables)
    }

    // MARK: - WiFi Connection
    func connectToWiFiCamera(ip: String) {
        print("📱 Connecting to WiFi camera at \(ip)")
        appState = .connecting
        connectionMode = .wifi

        let config = WiFiCameraService.CameraConfig(
            ip: ip,
            model: "Canon EOS (WLAN)",
            protocol: "ptpip"
        )

        wifiService.connect(config: config)
    }

    func disconnectWiFi() {
        print("📱 Disconnecting WiFi camera")
        wifiService.stopMonitoring()
        wifiService.disconnect()
        appState = .searching
    }
}
```

**Acceptance:**
- ✅ WiFi connection triggers state changes
- ✅ Photos automatically download when detected
- ✅ `capturedPhotos` array updates
- ✅ Stats update (photoCount, downloadingCount)

---

### Phase 5: UI Updates (2 hours)

**Create:** `WiFiSetupView.swift`
```swift
import SwiftUI

/// View for entering WiFi camera connection details
struct WiFiSetupView: View {
    @ObservedObject var viewModel: CameraViewModel
    @State private var cameraIP: String = "192.168.1.1"
    @State private var cameraModel: String = "Canon EOS (WLAN)"

    var body: some View {
        VStack(spacing: 24) {
            // Header
            Image(systemName: "wifi")
                .font(.system(size: 80))
                .foregroundColor(.blue)

            Text("Connect via WiFi")
                .font(.title)
                .fontWeight(.bold)

            Text("Make sure your camera is in WiFi mode and connected to the same network")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            // Input fields
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Camera IP Address")
                        .font(.headline)

                    TextField("192.168.1.1", text: $cameraIP)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numbersAndPunctuation)
                        .autocapitalization(.none)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Camera Model")
                        .font(.headline)

                    TextField("Canon EOS (WLAN)", text: $cameraModel)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                }
            }
            .padding(.horizontal, 32)

            // Connect button
            Button(action: {
                viewModel.connectToWiFiCamera(ip: cameraIP)
            }) {
                HStack {
                    Image(systemName: "wifi")
                    Text("Connect Camera")
                        .fontWeight(.semibold)
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .cornerRadius(12)
            }
            .padding(.horizontal, 32)
            .padding(.top, 8)

            // Quick tips
            VStack(alignment: .leading, spacing: 8) {
                Text("Quick Tips:")
                    .font(.caption)
                    .fontWeight(.bold)

                TipRow(icon: "1.circle.fill", text: "Enable WiFi on your camera")
                TipRow(icon: "2.circle.fill", text: "Connect iPad to same network")
                TipRow(icon: "3.circle.fill", text: "Check camera's IP in WiFi settings")
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .padding(.horizontal, 32)

            Spacer()
        }
        .padding()
    }
}

struct TipRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.blue)
            Text(text)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    WiFiSetupView(viewModel: CameraViewModel())
}
```

**Update:** `ContentView.swift`
```swift
struct ContentView: View {
    @StateObject private var viewModel = CameraViewModel()

    var body: some View {
        NavigationView {
            Group {
                switch viewModel.appState {
                case .searching:
                    // Start with WiFi setup instead of USB search
                    WiFiSetupView(viewModel: viewModel)

                case .cameraFound(let camera):
                    // Legacy USB path (can be disabled if Decision 1 = WiFi only)
                    CameraFoundView(camera: camera) {
                        viewModel.connectToCamera(camera)
                    }

                case .connecting:
                    ConnectingView()

                case .capturing:
                    LiveCaptureView(viewModel: viewModel)

                case .error(let message):
                    ErrorView(message: message) {
                        viewModel.appState = .searching
                    }

                case .ready:
                    // Can be removed - go straight to .capturing
                    EmptyView()
                }
            }
            .navigationTitle("SabaiPics Studio")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack) // Fix iPad sidebar
    }
}
```

**Update:** `LiveCaptureView.swift`

Add disconnect button:
```swift
// In action buttons section
VStack(spacing: 12) {
    // ... existing Take Photo button (can be removed for WiFi) ...

    // End Session button
    Button(action: {
        viewModel.disconnectWiFi()
    }) {
        Text("End Session")
            .font(.subheadline)
            .foregroundColor(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.red.opacity(0.1))
            .cornerRadius(8)
    }
}
```

**Acceptance:**
- ✅ WiFiSetupView shows on app launch
- ✅ User can enter camera IP
- ✅ Connect button triggers WiFi connection
- ✅ LiveCaptureView shows after connection
- ✅ End Session button disconnects and returns to setup

---

### Phase 6: Photo Download Integration (2 hours)

**Already handled in Phase 4!** The ViewModel's `setupWiFiBindings()` automatically downloads photos when detected.

Additional polish:

**Add download progress indicator:**
```swift
// In CapturedPhoto struct
struct CapturedPhoto: Identifiable {
    // ... existing properties ...
    var downloadProgress: Double? = nil // 0.0 to 1.0 for progress bar
}
```

**Add chunked download (optional, for large files):**
```objc
// In WiFiCameraManager.m
- (void)downloadPhotoAtPath:(NSString*)folder
                   filename:(NSString*)filename
                   progress:(void(^)(double progress))progressBlock
                 completion:(void(^)(NSData*, NSError*))completion {
    // Use gp_file_get_data_and_size with progress callback
    // Call progressBlock(0.5) for 50% complete, etc.
}
```

**Acceptance:**
- ✅ Photos download automatically after detection
- ✅ Thumbnails appear in grid
- ✅ Download count updates in real-time
- ✅ No UI freezing during download

---

### Phase 7: Testing & Polish (2 hours)

**Testing Checklist:**

1. **Connection Testing**
   - [ ] App launches to WiFi setup screen
   - [ ] Default IP "192.168.1.1" pre-filled
   - [ ] Connect button triggers connection
   - [ ] Camera connects within 3 seconds
   - [ ] Error handling: wrong IP shows error message
   - [ ] Error handling: camera off shows timeout error

2. **Photo Detection Testing**
   - [ ] Take 1 photo on camera → appears in app within 2 seconds
   - [ ] Take 5 photos rapid-fire → all appear in order
   - [ ] Photo order: newest first (top of grid)
   - [ ] Stats update: photo count increments correctly
   - [ ] Stats update: downloading count shows during transfer

3. **Photo Quality Testing**
   - [ ] Full-resolution JPEGs download (not thumbnails)
   - [ ] Photos display correctly in grid
   - [ ] Tap photo for full-screen view (if implemented)
   - [ ] No corruption or missing data

4. **Session Management Testing**
   - [ ] "End Session" disconnects cleanly
   - [ ] Can reconnect after ending session
   - [ ] Photos persist during session (don't disappear)
   - [ ] Memory usage stable (no leaks)

5. **Edge Cases**
   - [ ] Camera disconnected during session → error state
   - [ ] iPad disconnects from WiFi → error recovery
   - [ ] Background/foreground transitions work
   - [ ] Camera battery dies → graceful error

**Polish Tasks:**
- [ ] Add loading spinner during connection
- [ ] Add success checkmark animation when connected
- [ ] Add photo download animation (fade in)
- [ ] Add haptic feedback on photo download
- [ ] Improve error messages (user-friendly text)
- [ ] Add camera settings guide (how to enable WiFi)

**Acceptance:**
- ✅ All 5 testing checklists pass
- ✅ No crashes during 30-minute session
- ✅ Memory usage < 200 MB with 50 photos
- ✅ App ready for field testing

---

## File Structure After Integration

```
apps/studio/SabaiPicsStudio/
├── SabaiPicsStudio.xcodeproj
├── SabaiPicsStudio-Bridging-Header.h          [NEW]
├── WiFiCameraManager.h                         [NEW]
├── WiFiCameraManager.m                         [NEW]
├── WiFiCameraService.swift                     [NEW]
├── WiFiSetupView.swift                         [NEW]
├── CameraViewModel.swift                       [UPDATED - WiFi support]
├── ContentView.swift                           [UPDATED - WiFi flow]
├── LiveCaptureView.swift                       [UPDATED - disconnect]
├── CameraService.swift                         [LEGACY - keep or remove]
├── SearchingView.swift                         [LEGACY - keep or remove]
├── CameraFoundView.swift                       [LEGACY - keep or remove]
└── Frameworks/
    └── GPhoto2.xcframework                     [NEW]
```

**Lines of Code:**
- New files: ~800 lines
- Updated files: ~150 lines
- Total: ~950 lines

---

## Risks & Mitigation

### Risk 1: GPhoto2Framework Build Issues
**Likelihood:** Medium
**Impact:** High (blocks entire integration)
**Mitigation:**
- Test framework import in Phase 1 before writing any code
- Use exact same framework binary that worked in GPhoto2Example
- If build fails, use GPhoto2Example project as reference

### Risk 2: Bridging Header Conflicts
**Likelihood:** Low
**Impact:** Medium (compilation errors)
**Mitigation:**
- Keep bridging header minimal (only import gphoto2.h)
- Use Objective-C wrapper to avoid exposing C types to Swift
- Test compilation after Phase 2

### Risk 3: Camera Discovery Reliability
**Likelihood:** Medium
**Impact:** Medium (user has to manually enter IP)
**Mitigation:**
- Phase 1: Manual IP entry (always works)
- Phase 2: Add auto-discovery later (optional)
- Document camera WiFi setup clearly

### Risk 4: Photo Download Speed
**Likelihood:** Low
**Impact:** Low (slower than USB but acceptable)
**Mitigation:**
- WiFi should transfer ~5 MB/s (RAW photos in 2-3 seconds)
- If too slow, implement thumbnail-first download
- Queue downloads to prevent network congestion

### Risk 5: Memory Leaks in C/Objective-C Bridge
**Likelihood:** Medium
**Impact:** High (app crashes after extended use)
**Mitigation:**
- Use ARC for Objective-C objects
- Manually free GPhoto2 C structs (gp_camera_free, gp_file_free)
- Test with Instruments to detect leaks

---

## Success Criteria

**Phase completion criteria:**
- ✅ All 7 phases implemented
- ✅ Build succeeds with no errors
- ✅ All tests pass (30+ test cases)
- ✅ Tested on real iPad with Canon camera
- ✅ Photos transfer automatically within 2 seconds of capture
- ✅ No crashes during 30-minute session

**Production-ready criteria:**
- App Store build succeeds
- Privacy descriptions approved
- Field testing with photographer (1 real event)
- Performance: < 200 MB memory, 50+ photos handled smoothly

---

## Timeline

**Conservative estimate: 12 hours**
- Phase 1: 1 hour
- Phase 2: 2 hours
- Phase 3: 2 hours
- Phase 4: 1 hour
- Phase 5: 2 hours
- Phase 6: 2 hours
- Phase 7: 2 hours

**Optimistic estimate: 8 hours**
- Phases 1-6: 6 hours (if no major issues)
- Phase 7: 2 hours

**Realistic with breaks: 1.5-2 working days**

---

## Questions for Approval

Before starting implementation, please confirm your choices:

1. **Decision 1:** Keep both USB and WiFi, or WiFi only? **[ A / B ]**
2. **Decision 2:** Thin wrapper or full service layer? **[ A / B ]**
3. **Decision 3:** Simple WiFi flow or mode picker? **[ A / B ]**
4. **Decision 4:** Auto-download or manual download? **[ A / B ]**
5. **Decision 5:** New ViewModel or unified? **[ A / B ]**
6. **Decision 6:** Delete USB code or keep disabled? **[ A / B ]**

**My recommendations:**
- Decision 1: **B** (WiFi only - simpler, USB doesn't work)
- Decision 2: **B** (Full service layer - cleaner architecture)
- Decision 3: **A** (Simple WiFi flow - MVP first)
- Decision 4: **B** (Auto-download - matches vision)
- Decision 5: **B** (Unified ViewModel - single source of truth)
- Decision 6: **B** (Keep USB code disabled - reference/learning)

**Once you approve, I'll proceed with implementation!**

---

## Next Steps

1. **You review this plan** ← WE ARE HERE
2. You provide your decisions (1-6)
3. I begin Phase 1 (Framework Setup)
4. We iterate through Phases 2-7
5. Testing and polish
6. Field test with real event
7. 🎉 Ship to App Store!

---

**Questions? Concerns? Changes?** Let me know!
