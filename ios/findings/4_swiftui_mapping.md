# User Journeys with SwiftUI Implementation Mapping

**Last Updated:** 2026-01-09
**Purpose:** Complete user flows mapped to specific SwiftUI screens and code

---

## Journey 1: Happy Path (USB Connection)

**Frequency:** 90% of users
**Duration:** 2-3 hours
**Priority:** P0 - Must work perfectly

### Flow with SwiftUI Screens

```
Step 1: Launch App
├─ SwiftUI Screen: ContentView
├─ State: .searching
└─ Code Location: ContentView.swift

Step 2: Searching for Camera
├─ SwiftUI Screen: SearchingView
├─ Components: VStack, ProgressView, Label
└─ Code Location: SearchingView.swift

Step 3: Camera Found
├─ SwiftUI Screen: CameraFoundView
├─ Components: VStack, Button, Card (Color.secondary.opacity)
└─ Code Location: CameraFoundView.swift

Step 4: Connecting
├─ SwiftUI Screen: CameraFoundView (loading state)
├─ Components: ProgressView
└─ State: Transitioning to .connected

Step 5: Ready to Shoot
├─ SwiftUI Screen: ReadyToShootView
├─ Components: Image(systemName: "camera.shutter.button"), Text, VStack
└─ Code Location: ReadyToShootView.swift

Step 6: Live Capture (Main Screen)
├─ SwiftUI Screen: LiveCaptureView
├─ Components: ScrollView, LazyVGrid, PhotoThumbnailView
└─ Code Location: LiveCaptureView.swift + PhotoThumbnailView.swift

Step 7: Session Complete
├─ SwiftUI Screen: SessionCompleteView
├─ Components: VStack, Button, Stats card
└─ Code Location: SessionCompleteView.swift
```

### Detailed SwiftUI Implementation

#### Step 1-2: Launch & Searching

```swift
// ContentView.swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        NavigationStack {
            // State-based routing
            Group {
                switch cameraService.connectionState {
                case .searching:
                    SearchingView()  // ← Step 2
                case .found:
                    CameraFoundView()  // ← Step 3
                case .connected:
                    if cameraService.photos.isEmpty {
                        ReadyToShootView()  // ← Step 5
                    } else {
                        LiveCaptureView()  // ← Step 6
                    }
                case .disconnected:
                    SessionCompleteView()  // ← Step 7
                }
            }
            .navigationTitle("SabaiPics Pro")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
```

**SwiftUI Components Used:**
- `NavigationStack` - App navigation container
- `Group` - Conditional rendering
- `switch` - State-based view selection
- `@EnvironmentObject` - Shared state access

#### Step 2: Searching Screen

```swift
// SearchingView.swift
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

            // Loading indicator - PRIMARY USER FEEDBACK
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)

                Text("Looking for cameras...")
                    .font(.headline)
            }

            Spacer()

            // Instructions card
            InstructionsCard()

            Spacer()
        }
        .padding()
        .onAppear {
            // Trigger camera search when view appears
            cameraService.startSearching()
        }
    }
}

// Reusable component
struct InstructionsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Connect camera via USB cable",
                  systemImage: "cable.connector")
            Label("Or enable WiFi on camera",
                  systemImage: "wifi")
        }
        .font(.subheadline)
        .foregroundColor(.secondary)
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}
```

**SwiftUI Components Used:**
- `VStack` - Vertical layout with spacing
- `Image(systemName:)` - SF Symbols icons
- `ProgressView()` - Loading spinner
- `Label` - Icon + text combo
- `.onAppear` - Lifecycle hook
- `.font()`, `.foregroundColor()` - Styling
- `.padding()`, `.background()`, `.cornerRadius()` - Card design

**User Sees:**
```
┌─────────────────────────────────┐
│                                 │
│      [Camera Icon - 80pt]       │
│      SabaiPics Pro              │
│   Event Photography Companion   │
│                                 │
│      [Loading Spinner]          │
│   Looking for cameras...        │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔌 Connect via USB      │   │
│  │ 📶 Or enable WiFi       │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

#### Step 3: Camera Found

```swift
// CameraFoundView.swift
import SwiftUI

struct CameraFoundView: View {
    @EnvironmentObject var cameraService: CameraService
    @State private var isConnecting = false

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Success icon
            Image(systemName: "camera.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("Camera Found")
                .font(.title)
                .fontWeight(.bold)

            // Camera details card - PRIMARY INFO
            CameraDetailsCard(
                name: cameraService.cameraName,
                connectionType: cameraService.connectionType,
                serialNumber: cameraService.serialNumber
            )

            // Connect button - PRIMARY ACTION
            Button(action: connectCamera) {
                if isConnecting {
                    HStack {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        Text("Connecting...")
                    }
                } else {
                    Text("Connect Camera")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isConnecting)

            Spacer()

            // Requirements info
            RequirementsCard()

            Spacer()
        }
        .padding()
    }

    private func connectCamera() {
        isConnecting = true
        cameraService.connectCamera()
    }
}

// Reusable camera details card
struct CameraDetailsCard: View {
    let name: String
    let connectionType: String
    let serialNumber: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "camera")
                Text(name)
                    .font(.headline)
            }

            HStack {
                Image(systemName: "cable.connector")
                Text(connectionType)
                    .foregroundColor(.secondary)
            }

            if let serial = serialNumber {
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
    }
}

// Custom button style
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(configuration.isPressed ? Color.blue.opacity(0.8) : Color.blue)
            .cornerRadius(12)
            .padding(.horizontal)
    }
}

struct RequirementsCard: View {
    var body: some View {
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
    }
}
```

**SwiftUI Components Used:**
- `@State` - Local component state
- `Button(action:)` - Tap handler
- `ButtonStyle` - Custom button appearance
- `.disabled()` - Disable during loading
- `HStack` - Horizontal layout
- Custom view components (CameraDetailsCard, etc.)

**User Interaction:**
```
User sees:
┌─────────────────────────────────┐
│   [Green Camera Icon]           │
│   Camera Found                  │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📷 Canon EOS R5         │   │
│  │ 🔌 USB Connected        │   │
│  │ 🔢 Serial: 123456       │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │   Connect Camera        │   │ ← User taps
│  └─────────────────────────┘   │
└─────────────────────────────────┘

After tap:
┌─────────────────────────────────┐
│  ┌─────────────────────────┐   │
│  │ [Spinner] Connecting... │   │ ← Button changes
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### Step 5: Ready to Shoot

```swift
// ReadyToShootView.swift
import SwiftUI

struct ReadyToShootView: View {
    @EnvironmentObject var cameraService: CameraService

    var body: some View {
        VStack(spacing: 30) {
            // Header with camera name and disconnect
            HeaderBar(
                cameraName: cameraService.cameraName,
                onDisconnect: { cameraService.disconnect() }
            )

            Spacer()

            // Ready state - WAITING FOR FIRST PHOTO
            ReadyStateCard()

            Spacer()

            // Session stats - ALL ZEROS
            SessionStatsCard(
                photosCount: 0,
                savedCount: 0
            )

            // Settings preview
            SettingsPreviewCard()

            Spacer()
        }
    }
}

struct HeaderBar: View {
    let cameraName: String
    let onDisconnect: () -> Void

    var body: some View {
        HStack {
            Label(cameraName, systemImage: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.headline)

            Spacer()

            Button("Disconnect", action: onDisconnect)
                .foregroundColor(.red)
        }
        .padding()
    }
}

struct ReadyStateCard: View {
    var body: some View {
        VStack(spacing: 20) {
            // Animated camera icon
            Image(systemName: "camera.shutter.button")
                .font(.system(size: 80))
                .foregroundColor(.blue)
                .symbolEffect(.pulse)  // iOS 17+ animation

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
    }
}

struct SessionStatsCard: View {
    let photosCount: Int
    let savedCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Session Status:")
                .font(.headline)

            HStack {
                Label("\(photosCount) photos captured",
                      systemImage: "camera")
                Spacer()
            }

            HStack {
                Label("\(savedCount) saved locally",
                      systemImage: "internaldrive")
                Spacer()
            }
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}
```

**SwiftUI Components Used:**
- `.symbolEffect(.pulse)` - SF Symbols animation (iOS 17+)
- Custom view decomposition
- Reusable components

**User Sees:**
```
┌─────────────────────────────────┐
│ ✅ Canon EOS R5  [Disconnect]   │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐ │
│  │                           │ │
│  │  [Pulsing Camera Icon]    │ │
│  │                           │ │
│  │   Ready to Shoot          │ │
│  │                           │ │
│  │  Take photos with camera  │ │
│  │  shutter to begin         │ │
│  │                           │ │
│  └───────────────────────────┘ │
│                                 │
│  Session Status:                │
│  📸 0 photos captured           │
│  💾 0 saved locally             │
│                                 │
└─────────────────────────────────┘

Waiting for photographer to press camera shutter...
```

#### Step 6: Live Capture (MAIN SCREEN)

```swift
// LiveCaptureView.swift
import SwiftUI

struct LiveCaptureView: View {
    @EnvironmentObject var cameraService: CameraService
    @State private var selectedPhoto: CapturedPhoto?

    var body: some View {
        VStack(spacing: 0) {
            // Stats header bar - LIVE UPDATES
            StatsHeaderBar(
                photoCount: cameraService.photos.count,
                savedCount: cameraService.savedCount,
                downloadingCount: cameraService.downloadingCount,
                onEndSession: { cameraService.endSession() }
            )

            // Photo grid - PRIMARY CONTENT
            PhotoGridView(
                photos: cameraService.photos,
                onPhotoTap: { photo in
                    selectedPhoto = photo
                }
            )

            // View all button
            Button(action: { /* Show full list */ }) {
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

// Stats header with live counts
struct StatsHeaderBar: View {
    let photoCount: Int
    let savedCount: Int
    let downloadingCount: Int
    let onEndSession: () -> Void

    var body: some View {
        HStack(spacing: 20) {
            // Photos captured
            Label("\(photoCount)", systemImage: "camera")
                .font(.headline)

            // Saved locally
            Label("\(savedCount)", systemImage: "internaldrive")
                .font(.headline)

            // Currently downloading (only show if > 0)
            if downloadingCount > 0 {
                Label("\(downloadingCount)", systemImage: "arrow.down.circle")
                    .font(.headline)
                    .foregroundColor(.blue)
            }

            Spacer()

            Button("End", action: onEndSession)
                .foregroundColor(.red)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
    }
}

// Photo grid with LazyVGrid
struct PhotoGridView: View {
    let photos: [CapturedPhoto]
    let onPhotoTap: (CapturedPhoto) -> Void

    // Grid layout - 3 columns
    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                // Reversed to show latest first
                ForEach(photos.reversed()) { photo in
                    PhotoThumbnailView(photo: photo)
                        .aspectRatio(1, contentMode: .fill)
                        .onTapGesture {
                            onPhotoTap(photo)
                        }
                }
            }
        }
    }
}

// Individual photo thumbnail with status badge
struct PhotoThumbnailView: View {
    let photo: CapturedPhoto

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // Thumbnail image or placeholder
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

            // Status badge - CRITICAL FEEDBACK
            StatusBadge(status: photo.status)
                .padding(4)
        }
        .clipped()
    }
}

// Status badge component
struct StatusBadge: View {
    let status: PhotoStatus

    var body: some View {
        Group {
            switch status {
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
            }
        }
    }
}
```

**SwiftUI Components Used:**
- `LazyVGrid` - Efficient grid (only renders visible items)
- `ScrollView` - Scrollable container
- `ForEach` - List iteration with identifiable items
- `ZStack` - Layer views (image + badge)
- `.sheet(item:)` - Modal presentation
- `.toolbar` - Navigation bar customization
- `.reversed()` - Show latest photos first
- `.onTapGesture` - Tap handling

**User Sees:**
```
┌─────────────────────────────────┐
│ ✅ Canon EOS R5          [End]  │
│ 📸 45  💾 43  ⬇️ 2              │
├─────────────────────────────────┤
│ ┌───┬───┬───┐                   │
│ │[T]│[T]│[T]│ ← Latest row      │
│ │045│044│043│                   │
│ │⬇️ │⬇️ │✅ │ ← Status badges   │
│ ├───┼───┼───┤                   │
│ │[T]│[T]│[T]│                   │
│ │042│041│040│                   │
│ │✅ │✅ │✅ │                   │
│ ├───┼───┼───┤                   │
│ │[T]│[T]│[T]│                   │
│ │039│038│037│                   │
│ │✅ │✅ │✅ │                   │
│ └───┴───┴───┘                   │
│     [Scroll to see more]        │
│                                 │
│ ┌─────────────────────────────┐ │
│ │    View All Photos          │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘

Real-time updates:
- Photographer presses shutter
- New thumbnail appears at top with ⬇️
- 2 seconds later: ⬇️ changes to ✅
- Stats update: 📸 46  💾 44  ⬇️ 2
```

**Key Reactive Behavior:**

```swift
// In CameraService.swift
@MainActor
class CameraService: ObservableObject {
    @Published var photos: [CapturedPhoto] = []
    // ↑ When this changes, SwiftUI automatically re-renders

    // Computed property - auto-updates UI
    var savedCount: Int {
        photos.filter { $0.status == .saved }.count
    }

    var downloadingCount: Int {
        photos.filter { $0.status == .downloading }.count
    }

    // When new photo captured (from ICCameraDeviceDelegate)
    func cameraDevice(_ camera: ICCameraDevice,
                     didAdd items: [ICCameraItem]) {
        Task { @MainActor in
            for item in items {
                let photo = CapturedPhoto(...)
                self.photos.append(photo)  // ← UI updates!
            }
        }
    }
}
```

#### Step 7: Session Complete

```swift
// SessionCompleteView.swift
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

            // Stats summary card
            SessionSummaryCard(
                photosCount: cameraService.photos.count,
                savedCount: cameraService.savedCount,
                uploadedCount: 0,
                totalSize: cameraService.totalSize,
                duration: cameraService.sessionDuration
            )

            Spacer()

            // Action buttons
            VStack(spacing: 12) {
                // Primary action
                Button(action: { /* View photos */ }) {
                    Text("View All Photos")
                }
                .buttonStyle(PrimaryButtonStyle())

                // Secondary action
                Button(action: { /* Upload */ }) {
                    Text("Upload to SabaiPics")
                }
                .buttonStyle(SecondaryButtonStyle())

                // Tertiary action
                Button(action: { cameraService.startNewSession() }) {
                    Text("Start New Session")
                }
                .buttonStyle(TertiaryButtonStyle())
            }
            .padding(.horizontal)

            Spacer()
        }
        .padding()
    }
}

struct SessionSummaryCard: View {
    let photosCount: Int
    let savedCount: Int
    let uploadedCount: Int
    let totalSize: String
    let duration: String

    var body: some View {
        VStack(spacing: 16) {
            StatRow(icon: "camera", label: "\(photosCount) photos captured")
            StatRow(icon: "internaldrive", label: "\(savedCount) saved locally")
            StatRow(icon: "cloud", label: "\(uploadedCount) uploaded to cloud")

            Divider()

            HStack {
                Text("Total size:")
                Spacer()
                Text(totalSize)
                    .fontWeight(.semibold)
            }

            HStack {
                Text("Duration:")
                Spacer()
                Text(duration)
                    .fontWeight(.semibold)
            }
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct StatRow: View {
    let icon: String
    let label: String

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
        }
    }
}

// Button styles for different action priorities
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.blue)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)
    }
}

struct TertiaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
    }
}
```

**SwiftUI Components Used:**
- `Divider` - Visual separator
- Custom `ButtonStyle` variants
- Computed properties from service

**User Sees:**
```
┌─────────────────────────────────┐
│                                 │
│   [Green Checkmark - 80pt]      │
│   Session Complete              │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📸 145 photos captured  │   │
│  │ 💾 145 saved locally    │   │
│  │ ☁️ 0 uploaded to cloud  │   │
│  │ ───────────────────     │   │
│  │ Total: 6.2 GB           │   │
│  │ Duration: 2h 34m        │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │  View All Photos        │   │ ← Primary (blue)
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Upload to SabaiPics    │   │ ← Secondary (blue outline)
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Start New Session      │   │ ← Tertiary (gray)
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

---

## Journey 2: WiFi Manual IP Flow

**Frequency:** 5% (development/fallback)
**Priority:** P1

### SwiftUI Implementation

```swift
// WiFiManualConnectionView.swift
import SwiftUI

struct WiFiManualConnectionView: View {
    @EnvironmentObject var cameraService: CameraService
    @State private var ipAddress: String = "192.168.1.1"
    @State private var selectedModel: String = "Canon EOS R5"
    @State private var isConnecting: Bool = false

    let cameraModels = [
        "Canon EOS R5",
        "Canon EOS R6",
        "Nikon Z9",
        "Sony A7R V"
    ]

    var body: some View {
        Form {
            // Instructions section
            Section {
                WiFiSetupInstructions()
            }

            // Input section
            Section("Camera Details") {
                // IP Address input
                HStack {
                    Text("Camera IP:")
                        .frame(width: 100, alignment: .leading)

                    TextField("192.168.1.1", text: $ipAddress)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }

                // Model picker
                Picker("Camera Model", selection: $selectedModel) {
                    ForEach(cameraModels, id: \.self) { model in
                        Text(model).tag(model)
                    }
                }
            }

            // Common IPs section
            Section("Common IPs") {
                CommonIPButton(brand: "Canon", ip: "192.168.1.1") {
                    ipAddress = "192.168.1.1"
                }
                CommonIPButton(brand: "Nikon", ip: "192.168.1.1") {
                    ipAddress = "192.168.1.1"
                }
                CommonIPButton(brand: "Sony", ip: "192.168.122.1") {
                    ipAddress = "192.168.122.1"
                }
            }

            // Connect button
            Section {
                Button(action: connectToCamera) {
                    if isConnecting {
                        HStack {
                            ProgressView()
                            Text("Connecting...")
                        }
                    } else {
                        Text("Connect to Camera")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(isConnecting || ipAddress.isEmpty)
            }
        }
        .navigationTitle("WiFi Manual Setup")
    }

    private func connectToCamera() {
        isConnecting = true
        cameraService.connectManualWiFi(ip: ipAddress, model: selectedModel)
    }
}

// WiFi setup instructions component
struct WiFiSetupInstructions: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            InstructionStep(
                number: 1,
                text: "Enable 'Connect to Smartphone' on camera"
            )
            InstructionStep(
                number: 2,
                text: "Join camera WiFi network in iPhone Settings"
            )
            InstructionStep(
                number: 3,
                text: "Enter camera IP address below"
            )
        }
        .padding(.vertical, 8)
    }
}

struct InstructionStep: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number).")
                .font(.headline)
                .foregroundColor(.blue)
                .frame(width: 24)

            Text(text)
                .font(.subheadline)
        }
    }
}

struct CommonIPButton: View {
    let brand: String
    let ip: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(brand)
                    .font(.subheadline)
                Spacer()
                Text(ip)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Image(systemName: "arrow.right.circle")
                    .foregroundColor(.blue)
            }
        }
    }
}
```

**SwiftUI Components Used:**
- `Form` - Native iOS form layout
- `Section` - Form sections with headers
- `TextField` - Text input with keyboard type
- `Picker` - Dropdown selection
- `.keyboardType(.decimalPad)` - Numeric keyboard
- `@State` - Local form state

**User Interaction:**
```
┌─────────────────────────────────┐
│ WiFi Manual Setup               │
├─────────────────────────────────┤
│ Setup Instructions              │
│ 1. Enable 'Connect to Phone'    │
│ 2. Join camera WiFi             │
│ 3. Enter IP below               │
├─────────────────────────────────┤
│ Camera Details                  │
│                                 │
│ Camera IP: [192.168.1.1  ]      │ ← TextField
│                                 │
│ Camera Model: Canon EOS R5 >    │ ← Picker
├─────────────────────────────────┤
│ Common IPs                      │
│ Canon       192.168.1.1    →    │ ← Tap to fill
│ Nikon       192.168.1.1    →    │
│ Sony        192.168.122.1  →    │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │   Connect to Camera         │ │ ← Button
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## Journey 4: Error Recovery - USB Disconnected

**Frequency:** 5%
**Priority:** P0

### SwiftUI Implementation

```swift
// ErrorRecoveryView.swift
import SwiftUI

struct ConnectionLostView: View {
    @EnvironmentObject var cameraService: CameraService
    let lostPhotosCount: Int

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Error icon
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 80))
                .foregroundColor(.orange)

            Text("Connection Lost")
                .font(.title)
                .fontWeight(.bold)

            // Error details card
            ErrorDetailsCard(
                savedCount: cameraService.savedCount,
                lostCount: lostPhotosCount
            )

            Spacer()

            // Recovery actions
            VStack(spacing: 12) {
                Button(action: { cameraService.attemptReconnect() }) {
                    Label("Reconnect Camera", systemImage: "arrow.clockwise")
                }
                .buttonStyle(PrimaryButtonStyle())

                Button(action: { cameraService.endSession() }) {
                    Text("End Session (Save Current Photos)")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(.horizontal)

            Spacer()

            // Troubleshooting tips
            TroubleshootingCard()
        }
        .padding()
    }
}

struct ErrorDetailsCard: View {
    let savedCount: Int
    let lostCount: Int

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                Text("\(savedCount) photos saved")
                Spacer()
            }

            if lostCount > 0 {
                HStack {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.red)
                    Text("\(lostCount) photos lost")
                    Spacer()
                }
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct TroubleshootingCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Troubleshooting:")
                .font(.subheadline)
                .fontWeight(.semibold)

            BulletPoint("Reconnect USB cable")
            BulletPoint("Check cable is not damaged")
            BulletPoint("Try different USB port")
        }
        .font(.caption)
        .foregroundColor(.secondary)
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct BulletPoint: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        HStack(alignment: .top) {
            Text("•")
            Text(text)
        }
    }
}
```

**SwiftUI Components Used:**
- Conditional rendering (`if lostCount > 0`)
- Color-coded status (green/red)
- Custom bullet point component

**User Sees:**
```
┌─────────────────────────────────┐
│                                 │
│   [Orange Triangle Warning]     │
│   Connection Lost               │
│                                 │
│  ┌─────────────────────────┐   │
│  │ ✅ 43 photos saved      │   │
│  │ ❌ 2 photos lost        │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔄 Reconnect Camera     │   │ ← Primary action
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ End Session             │   │ ← Safe fallback
│  │ (Save Current Photos)   │   │
│  └─────────────────────────┘   │
│                                 │
│  Troubleshooting:               │
│  • Reconnect USB cable          │
│  • Check cable not damaged      │
│  • Try different USB port       │
│                                 │
└─────────────────────────────────┘
```

---

## Data Flow & State Management

### CameraService Architecture

```swift
import ImageCaptureCore
import Combine

// MARK: - State Enum
enum ConnectionState {
    case searching        // Step 2
    case found           // Step 3
    case connected       // Step 5-6
    case disconnected    // Step 7 or error
}

enum PhotoStatus {
    case downloading     // Blue badge (⬇️)
    case saved          // Green badge (✅)
    case error          // Red badge (❌)
}

// MARK: - Data Model
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

// MARK: - Observable Service
@MainActor
class CameraService: NSObject, ObservableObject {
    // Published properties - trigger UI updates
    @Published var connectionState: ConnectionState = .searching
    @Published var cameraName: String = ""
    @Published var connectionType: String = ""
    @Published var serialNumber: String?
    @Published var photos: [CapturedPhoto] = []

    // Private state
    private var browser: ICDeviceBrowser?
    private var camera: ICCameraDevice?
    private var sessionStartTime: Date?

    // Computed properties - auto-update UI
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
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    // Public methods
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
    nonisolated func deviceBrowser(
        _ browser: ICDeviceBrowser,
        didAdd device: ICDevice,
        moreComing: Bool
    ) {
        guard let camera = device as? ICCameraDevice else { return }

        Task { @MainActor in
            self.camera = camera
            self.cameraName = camera.name ?? "Unknown"
            self.connectionType = "USB Connected"
            self.serialNumber = camera.serialNumberString
            self.connectionState = .found  // ← Triggers UI update

            camera.delegate = self
        }
    }

    nonisolated func cameraDevice(
        _ camera: ICCameraDevice,
        didOpenSessionWithError error: Error?
    ) {
        Task { @MainActor in
            if error == nil {
                self.connectionState = .connected  // ← Triggers UI update
                self.sessionStartTime = Date()
                camera.requestEnableTethering()
            }
        }
    }
}

// MARK: - ICCameraDeviceDelegate
extension CameraService: ICCameraDeviceDelegate {
    nonisolated func cameraDevice(
        _ camera: ICCameraDevice,
        didAdd items: [ICCameraItem]
    ) {
        Task { @MainActor in
            for item in items {
                guard let file = item as? ICCameraFile else { continue }

                // Create photo with downloading status
                var photo = CapturedPhoto(
                    filename: file.name,
                    fileSize: file.fileSize,
                    fileType: file.isRaw ? "RAW" : "JPEG",
                    captureDate: file.creationDate ?? Date(),
                    status: .downloading
                )

                self.photos.append(photo)  // ← Triggers UI update!

                // Start download
                await downloadFile(file, photoID: photo.id)
            }
        }
    }

    private func downloadFile(_ file: ICCameraFile, photoID: UUID) async {
        // Download implementation...
        // When complete, update photo status

        if let index = photos.firstIndex(where: { $0.id == photoID }) {
            photos[index].status = .saved  // ← Triggers UI update!
        }
    }
}
```

### Reactive UI Updates Flow

```
Photographer presses camera shutter
          ↓
ICCameraDeviceDelegate.didAdd called
          ↓
CameraService.photos.append(newPhoto)
          ↓
@Published property changed
          ↓
SwiftUI detects change
          ↓
LiveCaptureView re-renders
          ↓
LazyVGrid adds new cell
          ↓
PhotoThumbnailView shows ⬇️ badge
          ↓
          ↓ (2 seconds later)
Download completes
          ↓
photos[index].status = .saved
          ↓
@Published property changed
          ↓
PhotoThumbnailView re-renders
          ↓
Badge changes ⬇️ → ✅
```

---

## Complete SwiftUI Component Hierarchy

```
App
└── WindowGroup
    └── ContentView (@EnvironmentObject cameraService)
        └── NavigationStack
            └── Group (state-based routing)
                ├── SearchingView
                │   ├── VStack
                │   ├── Image (logo)
                │   ├── ProgressView
                │   └── InstructionsCard
                │
                ├── CameraFoundView
                │   ├── VStack
                │   ├── CameraDetailsCard
                │   ├── Button (Connect)
                │   └── RequirementsCard
                │
                ├── ReadyToShootView
                │   ├── HeaderBar
                │   ├── ReadyStateCard
                │   │   └── Image (.symbolEffect)
                │   ├── SessionStatsCard
                │   └── SettingsPreviewCard
                │
                ├── LiveCaptureView (MAIN)
                │   ├── StatsHeaderBar
                │   ├── PhotoGridView
                │   │   └── ScrollView
                │   │       └── LazyVGrid
                │   │           └── ForEach
                │   │               └── PhotoThumbnailView
                │   │                   ├── ZStack
                │   │                   ├── Image (thumbnail)
                │   │                   └── StatusBadge
                │   ├── Button (View All)
                │   └── .sheet (PhotoDetailView)
                │
                └── SessionCompleteView
                    ├── Image (success)
                    ├── SessionSummaryCard
                    └── VStack (action buttons)
```

---

## Summary: Journey → SwiftUI Mapping

| Journey Step | SwiftUI View | Key Components | State |
|--------------|--------------|----------------|-------|
| Launch | `ContentView` | `NavigationStack`, `Group` | `.searching` |
| Searching | `SearchingView` | `ProgressView`, `VStack` | `.searching` |
| Found | `CameraFoundView` | `Button`, Card | `.found` |
| Ready | `ReadyToShootView` | `.symbolEffect`, Stats | `.connected` |
| **Capturing** | `LiveCaptureView` | `LazyVGrid`, `ZStack` | `.connected` |
| Complete | `SessionCompleteView` | Summary, Buttons | `.disconnected` |
| Error | `ConnectionLostView` | Error card, Actions | `.disconnected` |

## All SwiftUI Primitives Used

### Layouts
- `VStack` - Vertical stacking
- `HStack` - Horizontal layout
- `ZStack` - Layering (badges)
- `LazyVGrid` - Efficient grid
- `ScrollView` - Scrolling
- `Form` - iOS forms
- `Section` - Form sections
- `NavigationStack` - Navigation

### Components
- `Image(systemName:)` - SF Symbols
- `Text` - Labels
- `Button` - Actions
- `Label` - Icon + text
- `ProgressView` - Loading
- `TextField` - Text input
- `Picker` - Dropdowns
- `Toggle` - Switches
- `Divider` - Separators

### Modifiers
- `.font()` - Typography
- `.foregroundColor()` - Colors
- `.padding()` - Spacing
- `.background()` - Fills
- `.cornerRadius()` - Rounded corners
- `.frame()` - Sizing
- `.symbolEffect()` - Animations
- `.sheet()` - Modals
- `.toolbar()` - Navigation bar
- `.onAppear()` - Lifecycle
- `.onTapGesture()` - Tap handling
- `.disabled()` - State control

### State Management
- `@State` - Local state
- `@StateObject` - Service creation
- `@EnvironmentObject` - Shared state
- `@Published` - Reactive properties
- `@MainActor` - UI thread safety

**Everything mapped from user journey to specific SwiftUI code!** 🎯
