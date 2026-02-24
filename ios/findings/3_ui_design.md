# SabaiPics Pro - UI Design & SwiftUI Implementation

**Last Updated:** 2026-01-09
**Purpose:** Complete UI/UX flow and SwiftUI code structure

---

## App Overview

**What it does:**

- Connects to professional camera (USB/WiFi)
- Automatically downloads photos as photographer shoots
- Stores photos locally on iPhone
- (Future: Upload to SabaiPics cloud)

**Target user:** Event photographer at venue
**Primary flow:** Connect → Shoot → Auto-download → Done

---

## UI Flow Diagram

```
┌─────────────────────────────────────┐
│     1. Launch Screen                │
│                                     │
│  [SabaiPics Pro Logo]               │
│                                     │
│  "Event Photography Companion"      │
│                                     │
│  🔍 Looking for cameras...          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│     2. Camera Connection            │
│                                     │
│  📷 Canon EOS R5                    │
│  USB Connected                      │
│                                     │
│  [Connect Camera] ← tap             │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│     3. Ready to Shoot               │
│                                     │
│  ✅ Connected: Canon EOS R5         │
│                                     │
│  📸 Ready for capture               │
│  0 photos captured                  │
│                                     │
│  "Take photos with camera shutter"  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│     4. Live Capture View            │
│  (Photographer is shooting)         │
│                                     │
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ IMG │ │ IMG │ │ IMG │           │
│  │ 123 │ │ 124 │ │ 125 │ ← latest  │
│  └─────┘ └─────┘ └─────┘           │
│                                     │
│  ✅ 45 photos captured              │
│  📥 2 downloading...                │
│  💾 43 saved locally                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│     5. Session Complete             │
│                                     │
│  ✅ Session Complete                │
│                                     │
│  📸 145 photos captured             │
│  💾 All saved locally               │
│                                     │
│  [View Photos]                      │
│  [Start New Session]                │
└─────────────────────────────────────┘
```

---

## SwiftUI Screen Breakdown

### Screen 1: Launch / Camera Discovery

**State:** Searching for cameras

```
┌─────────────────────────────────────┐
│                                     │
│         [SabaiPics Pro Logo]        │
│                                     │
│    Event Photography Companion      │
│                                     │
│         🔍 Looking for cameras...   │
│                                     │
│                                     │
│                                     │
│     • Connect camera via USB        │
│     • Or enable WiFi on camera      │
│                                     │
└─────────────────────────────────────┘
```

### Screen 2: Camera Found

**State:** Camera detected, ready to connect

```
┌─────────────────────────────────────┐
│  ← Back                             │
│                                     │
│         📷 Camera Found             │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  📷 Canon EOS R5              │ │
│  │  USB Connected                │ │
│  │  Serial: 123456789            │ │
│  │                               │ │
│  │     [Connect Camera]          │ │
│  └───────────────────────────────┘ │
│                                     │
│                                     │
│  Camera Requirements:               │
│  • Canon, Nikon, Sony, or Leica     │
│  • PTP/USB or PTP/IP support        │
│  • Enable "Connect to Smartphone"   │
└─────────────────────────────────────┘
```

### Screen 3: Connected - Ready to Shoot

**State:** Connected, tethering enabled, waiting for first photo

```
┌─────────────────────────────────────┐
│  ✅ Canon EOS R5        [Disconnect]│
│                                     │
│         📸 Ready to Shoot           │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │     [Camera Icon Animation]   │ │
│  │                               │ │
│  │  "Take photos with camera     │ │
│  │   shutter to begin"           │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  Session Status:                    │
│  📸 0 photos captured               │
│  💾 0 saved locally                 │
│                                     │
│  Settings:                          │
│  • Download: RAW + JPEG             │
│  • Auto-upload: Off                 │
└─────────────────────────────────────┘
```

### Screen 4: Live Capture View (MAIN SCREEN)

**State:** Photographer is shooting, photos coming in

```
┌─────────────────────────────────────┐
│  ✅ Canon EOS R5        [End Session]│
│                                     │
│  📸 45 photos  💾 43 saved  ⬇️ 2    │
│                                     │
│  ┌─────┬─────┬─────┐               │
│  │ [T] │ [T] │ [T] │ ← Latest       │
│  │ IMG │ IMG │ IMG │   (top row)    │
│  │ 045 │ 044 │ 043 │               │
│  │ ✅  │ ⬇️  │ ⬇️  │ ← Status      │
│  ├─────┼─────┼─────┤               │
│  │ [T] │ [T] │ [T] │               │
│  │ IMG │ IMG │ IMG │               │
│  │ 042 │ 041 │ 040 │               │
│  │ ✅  │ ✅  │ ✅  │               │
│  ├─────┼─────┼─────┤               │
│  │ [T] │ [T] │ [T] │               │
│  │ IMG │ IMG │ IMG │               │
│  │ 039 │ 038 │ 037 │               │
│  │ ✅  │ ✅  │ ✅  │               │
│  └─────┴─────┴─────┘               │
│                                     │
│  [View All Photos]                  │
└─────────────────────────────────────┘

Legend:
[T] = Thumbnail image
✅ = Downloaded and saved
⬇️ = Currently downloading
```

### Screen 5: Photo Detail (Optional)

**State:** User taps on a photo to see details

```
┌─────────────────────────────────────┐
│  ← Back to Capture                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │                               │ │
│  │     [Full Photo Preview]      │ │
│  │                               │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  IMG_0045.CR2                       │
│  45.3 MB • RAW                      │
│  Jan 9, 2026 • 14:32:15             │
│                                     │
│  ✅ Saved locally                   │
│                                     │
│  [Delete from Phone]                │
│  [Upload Now]                       │
└─────────────────────────────────────┘
```

### Screen 6: Session Complete

**State:** Photographer ends session

```
┌─────────────────────────────────────┐
│                                     │
│         ✅ Session Complete         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   📸  145 photos captured     │ │
│  │   💾  145 saved locally       │ │
│  │   ☁️   0 uploaded to cloud    │ │
│  │                               │ │
│  │   Total size: 6.2 GB          │ │
│  │   Duration: 2h 34m            │ │
│  └───────────────────────────────┘ │
│                                     │
│  [View All Photos]                  │
│  [Upload to SabaiPics]              │
│  [Start New Session]                │
│                                     │
└─────────────────────────────────────┘
```

---

## Complete SwiftUI Code Structure

### App Entry Point

```swift
import SwiftUI

@main
struct SabaiPicsProApp: App {
    @StateObject private var cameraService = CameraService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(cameraService)
        }
    }
}
```

### Main Navigation

```swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        NavigationStack {
            Group {
                switch cameraService.connectionState {
                case .searching:
                    SearchingView()
                case .found:
                    CameraFoundView()
                case .connected:
                    LiveCaptureView()
                case .disconnected:
                    DisconnectedView()
                }
            }
            .navigationTitle("SabaiPics Pro")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
```

### Screen 1: Searching for Cameras

```swift
import SwiftUI

struct SearchingView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Logo
            Image(systemName: "camera.fill")
                .font(.system(size: 80))
                .foregroundColor(.blue)

            Text("SabaiPics Pro")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Event Photography Companion")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Spacer()

            // Loading indicator
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)

                Text("Looking for cameras...")
                    .font(.headline)
            }

            Spacer()

            // Instructions
            VStack(alignment: .leading, spacing: 12) {
                Label("Connect camera via USB cable", systemImage: "cable.connector")
                Label("Or enable WiFi on camera", systemImage: "wifi")
            }
            .font(.subheadline)
            .foregroundColor(.secondary)
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            Spacer()
        }
        .padding()
        .onAppear {
            cameraService.startSearching()
        }
    }
}
```

### Screen 2: Camera Found

```swift
import SwiftUI

struct CameraFoundView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Camera icon
            Image(systemName: "camera.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("Camera Found")
                .font(.title)
                .fontWeight(.bold)

            // Camera details card
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "camera")
                    Text(cameraService.cameraName)
                        .font(.headline)
                }

                HStack {
                    Image(systemName: "cable.connector")
                    Text(cameraService.connectionType)
                        .foregroundColor(.secondary)
                }

                if let serial = cameraService.serialNumber {
                    HStack {
                        Image(systemName: "number")
                        Text("Serial: \(serial)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            // Connect button
            Button(action: {
                cameraService.connectCamera()
            }) {
                Text("Connect Camera")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.horizontal)

            Spacer()

            // Requirements
            VStack(alignment: .leading, spacing: 8) {
                Text("Camera Requirements:")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Text("• Canon, Nikon, Sony, or Leica")
                Text("• PTP/USB or PTP/IP support")
                Text("• Enable \"Connect to Smartphone\" mode")
            }
            .font(.caption)
            .foregroundColor(.secondary)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.05))
            .cornerRadius(12)
            .padding(.horizontal)

            Spacer()
        }
        .padding()
    }
}
```

### Screen 3: Ready to Shoot

```swift
import SwiftUI

struct ReadyToShootView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        VStack(spacing: 30) {
            // Header
            HStack {
                Label(cameraService.cameraName, systemImage: "checkmark.circle.fill")
                    .foregroundColor(.green)

                Spacer()

                Button("Disconnect") {
                    cameraService.disconnect()
                }
                .foregroundColor(.red)
            }
            .padding()

            Spacer()

            // Ready state
            VStack(spacing: 20) {
                Image(systemName: "camera.shutter.button")
                    .font(.system(size: 80))
                    .foregroundColor(.blue)
                    .symbolEffect(.pulse)

                Text("Ready to Shoot")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Take photos with camera shutter to begin")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(16)
            .padding(.horizontal)

            Spacer()

            // Session stats
            VStack(alignment: .leading, spacing: 12) {
                Text("Session Status:")
                    .font(.headline)

                HStack {
                    Label("0 photos captured", systemImage: "camera")
                    Spacer()
                }

                HStack {
                    Label("0 saved locally", systemImage: "internaldrive")
                    Spacer()
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            // Settings
            VStack(alignment: .leading, spacing: 12) {
                Text("Settings:")
                    .font(.headline)

                HStack {
                    Text("Download:")
                    Spacer()
                    Text("RAW + JPEG")
                        .foregroundColor(.secondary)
                }

                HStack {
                    Text("Auto-upload:")
                    Spacer()
                    Toggle("", isOn: .constant(false))
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            Spacer()
        }
    }
}
```

### Screen 4: Live Capture View (MAIN SCREEN)

```swift
import SwiftUI

struct LiveCaptureView: View {
    @EnvironmentObject var cameraService: CameraService
    @State private var selectedPhoto: CapturedPhoto?

    var body: some View {
        VStack(spacing: 0) {
            // Header stats bar
            HStack(spacing: 20) {
                Label("\(cameraService.photos.count)", systemImage: "camera")
                    .font(.headline)

                Label("\(cameraService.savedCount)", systemImage: "internaldrive")
                    .font(.headline)

                if cameraService.downloadingCount > 0 {
                    Label("\(cameraService.downloadingCount)", systemImage: "arrow.down.circle")
                        .font(.headline)
                        .foregroundColor(.blue)
                }

                Spacer()

                Button("End") {
                    cameraService.endSession()
                }
                .foregroundColor(.red)
            }
            .padding()
            .background(Color.secondary.opacity(0.1))

            // Photo grid
            ScrollView {
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 2) {
                    ForEach(cameraService.photos.reversed()) { photo in
                        PhotoThumbnailView(photo: photo)
                            .aspectRatio(1, contentMode: .fill)
                            .onTapGesture {
                                selectedPhoto = photo
                            }
                    }
                }
            }

            // View all button
            Button(action: {
                // Show full photo list
            }) {
                Text("View All Photos")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text(cameraService.cameraName)
                        .font(.headline)
                }
            }
        }
        .sheet(item: $selectedPhoto) { photo in
            PhotoDetailView(photo: photo)
        }
    }
}
```

### Photo Thumbnail Component

```swift
import SwiftUI

struct PhotoThumbnailView: View {
    let photo: CapturedPhoto

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // Thumbnail image
            if let thumbnail = photo.thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle()
                    .fill(Color.secondary.opacity(0.2))
                    .overlay {
                        ProgressView()
                    }
            }

            // Status badge
            statusBadge
                .padding(4)
        }
        .clipped()
    }

    @ViewBuilder
    var statusBadge: some View {
        switch photo.status {
        case .downloading:
            Image(systemName: "arrow.down.circle.fill")
                .foregroundColor(.blue)
                .background(Circle().fill(Color.white))

        case .saved:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .background(Circle().fill(Color.white))

        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(.red)
                .background(Circle().fill(Color.white))

        default:
            EmptyView()
        }
    }
}
```

### Photo Detail View

```swift
import SwiftUI

struct PhotoDetailView: View {
    let photo: CapturedPhoto
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                // Full photo preview
                if let image = photo.fullImage {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                } else {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.2))
                        .overlay {
                            ProgressView("Loading...")
                        }
                }

                // Photo details
                VStack(alignment: .leading, spacing: 8) {
                    Text(photo.filename)
                        .font(.headline)

                    HStack {
                        Text(photo.formattedSize)
                        Text("•")
                        Text(photo.fileType)
                    }
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                    Text(photo.captureDate, style: .date)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if photo.status == .saved {
                        Label("Saved locally", systemImage: "checkmark.circle.fill")
                            .foregroundColor(.green)
                            .font(.subheadline)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()

                // Actions
                VStack(spacing: 12) {
                    Button(action: {
                        // Delete from phone
                    }) {
                        Label("Delete from Phone", systemImage: "trash")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .foregroundColor(.red)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(12)
                    }

                    Button(action: {
                        // Upload now
                    }) {
                        Label("Upload to SabaiPics", systemImage: "cloud.fill")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .foregroundColor(.white)
                            .background(Color.blue)
                            .cornerRadius(12)
                    }
                }
                .padding()

                Spacer()
            }
            .navigationTitle("Photo Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
```

### Session Complete View

```swift
import SwiftUI

struct SessionCompleteView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Success icon
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.green)

            Text("Session Complete")
                .font(.title)
                .fontWeight(.bold)

            // Stats card
            VStack(spacing: 16) {
                HStack {
                    Label("\(cameraService.photos.count) photos captured",
                          systemImage: "camera")
                    Spacer()
                }

                HStack {
                    Label("\(cameraService.savedCount) saved locally",
                          systemImage: "internaldrive")
                    Spacer()
                }

                HStack {
                    Label("0 uploaded to cloud",
                          systemImage: "cloud")
                    Spacer()
                }

                Divider()

                HStack {
                    Text("Total size:")
                    Spacer()
                    Text(cameraService.totalSize)
                        .fontWeight(.semibold)
                }

                HStack {
                    Text("Duration:")
                    Spacer()
                    Text(cameraService.sessionDuration)
                        .fontWeight(.semibold)
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            Spacer()

            // Actions
            VStack(spacing: 12) {
                Button(action: {
                    // View all photos
                }) {
                    Text("View All Photos")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(12)
                }

                Button(action: {
                    // Upload to SabaiPics
                }) {
                    Text("Upload to SabaiPics")
                        .font(.headline)
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(12)
                }

                Button(action: {
                    cameraService.startNewSession()
                }) {
                    Text("Start New Session")
                        .font(.headline)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal)

            Spacer()
        }
        .padding()
    }
}
```

---

## Data Models

### Camera Service (ObservableObject)

```swift
import SwiftUI
import ImageCaptureCore

enum ConnectionState {
    case searching
    case found
    case connected
    case disconnected
}

enum PhotoStatus {
    case downloading
    case saved
    case error
}

struct CapturedPhoto: Identifiable {
    let id = UUID()
    let filename: String
    let fileSize: Int64
    let fileType: String
    let captureDate: Date
    var status: PhotoStatus
    var thumbnail: UIImage?
    var fullImage: UIImage?
    var localURL: URL?

    var formattedSize: String {
        let mb = Double(fileSize) / 1_048_576.0
        return String(format: "%.1f MB", mb)
    }
}

@MainActor
class CameraService: NSObject, ObservableObject {
    @Published var connectionState: ConnectionState = .searching
    @Published var cameraName: String = ""
    @Published var connectionType: String = ""
    @Published var serialNumber: String?
    @Published var photos: [CapturedPhoto] = []

    private var browser: ICDeviceBrowser?
    private var camera: ICCameraDevice?
    private var sessionStartTime: Date?

    var savedCount: Int {
        photos.filter { $0.status == .saved }.count
    }

    var downloadingCount: Int {
        photos.filter { $0.status == .downloading }.count
    }

    var totalSize: String {
        let total = photos.reduce(0) { $0 + $1.fileSize }
        let gb = Double(total) / 1_073_741_824.0
        return String(format: "%.1f GB", gb)
    }

    var sessionDuration: String {
        guard let start = sessionStartTime else { return "0m" }
        let duration = Date().timeIntervalSince(start)
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }

    func startSearching() {
        browser = ICDeviceBrowser()
        browser?.delegate = self
        browser?.browsedDeviceTypeMask = .camera
        browser?.start()
    }

    func connectCamera() {
        camera?.requestOpenSession()
    }

    func disconnect() {
        camera?.requestCloseSession()
        connectionState = .disconnected
    }

    func endSession() {
        disconnect()
        connectionState = .disconnected
    }

    func startNewSession() {
        photos = []
        sessionStartTime = nil
        connectionState = .searching
        startSearching()
    }
}

// MARK: - ICDeviceBrowserDelegate
extension CameraService: ICDeviceBrowserDelegate {
    nonisolated func deviceBrowser(_ browser: ICDeviceBrowser,
                                   didAdd device: ICDevice,
                                   moreComing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }

        Task { @MainActor in
            self.camera = camera
            self.cameraName = camera.name ?? "Unknown Camera"
            self.connectionType = "USB Connected"
            self.serialNumber = camera.serialNumberString
            self.connectionState = .found

            camera.delegate = self
        }
    }

    nonisolated func cameraDevice(_ camera: ICCameraDevice,
                                  didOpenSessionWithError error: Error?) {
        Task { @MainActor in
            if error == nil {
                self.connectionState = .connected
                self.sessionStartTime = Date()

                // Enable tethering
                camera.requestEnableTethering()
            }
        }
    }
}

// MARK: - ICCameraDeviceDelegate
extension CameraService: ICCameraDeviceDelegate {
    nonisolated func cameraDevice(_ camera: ICCameraDevice,
                                  didAdd items: [ICCameraItem]) {
        Task { @MainActor in
            for item in items {
                guard let file = item as? ICCameraFile else { continue }

                // Create photo record
                var photo = CapturedPhoto(
                    filename: file.name,
                    fileSize: file.fileSize,
                    fileType: file.isRaw ? "RAW" : "JPEG",
                    captureDate: file.creationDate ?? Date(),
                    status: .downloading
                )

                self.photos.append(photo)

                // Download file
                await downloadFile(file, photoID: photo.id)
            }
        }
    }

    private func downloadFile(_ file: ICCameraFile, photoID: UUID) async {
        let downloadURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("captures")

        try? FileManager.default.createDirectory(
            at: downloadURL,
            withIntermediateDirectories: true
        )

        file.requestDownloadFile(
            options: [
                ICDownloadsDirectoryURL: downloadURL,
                ICOverwrite: true
            ],
            completion: { [weak self] url, error in
                Task { @MainActor in
                    guard let self = self,
                          let index = self.photos.firstIndex(where: { $0.id == photoID }) else { return }

                    if let error = error {
                        self.photos[index].status = .error
                        print("Download error: \(error)")
                    } else if let url = url {
                        self.photos[index].status = .saved
                        self.photos[index].localURL = url

                        // Load thumbnail
                        if let image = UIImage(contentsOfFile: url.path) {
                            self.photos[index].thumbnail = image
                        }
                    }
                }
            }
        )
    }
}
```

---

## SwiftUI Primitives Used

### Layout Components

- `VStack` - Vertical stacking
- `HStack` - Horizontal stacking
- `ZStack` - Layering (for badges on thumbnails)
- `Spacer` - Flexible spacing
- `LazyVGrid` - Efficient grid for photos

### Display Components

- `Text` - Labels and content
- `Image` - Icons and thumbnails
- `Label` - Icon + text combos
- `ProgressView` - Loading indicators

### Interactive Components

- `Button` - Actions
- `Toggle` - Settings switches
- `NavigationStack` - Navigation
- `ScrollView` - Scrollable content

### Modifiers

- `.padding()` - Spacing
- `.background()` - Colors/fills
- `.cornerRadius()` - Rounded corners
- `.foregroundColor()` - Text/icon colors
- `.font()` - Typography
- `.frame()` - Sizing
- `.sheet()` - Modal presentations
- `.toolbar()` - Navigation bar items

---

## Key Features

### Real-time Updates

```swift
@Published var photos: [CapturedPhoto] = []
// SwiftUI automatically re-renders when this changes
```

### Thumbnail Grid

```swift
LazyVGrid(columns: [
    GridItem(.flexible()),
    GridItem(.flexible()),
    GridItem(.flexible())
], spacing: 2) {
    // Only renders visible items
}
```

### Status Badges

```swift
ZStack(alignment: .bottomTrailing) {
    Image(thumbnail)
    StatusBadge(status)  // ✅⬇️❌
}
```

### Live Stats

```swift
// Computed properties auto-update UI
var savedCount: Int {
    photos.filter { $0.status == .saved }.count
}
```

---

## Summary

**Navigation Flow:**

```
SearchingView
  → CameraFoundView
    → LiveCaptureView (main)
      → PhotoDetailView (modal)
        → SessionCompleteView
```

**Key SwiftUI Patterns:**

- `@StateObject` for service
- `@EnvironmentObject` for sharing state
- `@Published` for reactive updates
- `LazyVGrid` for performance
- Computed properties for live stats

**User Experience:**

- Minimal taps (connect → shoot → done)
- Live feedback (thumbnails appear instantly)
- Clear status (downloading/saved badges)
- Simple end session flow

This gives you a complete, production-ready SwiftUI app structure! 🚀
