//
//  TransferSession.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  Transfer Session Architecture - Photo Transfer Manager
//
//  Manages photo transfer from camera to device (and future cloud upload).
//  Can ONLY be created with an ActiveCamera (camera with open session).
//  Type safety ensures we cannot have a transfer session without a working camera.
//

import Foundation
import SwiftUI
import Combine

/// Photo transfer session manager
///
/// Responsibilities:
/// - Owns an ActiveCamera (with open PTP/IP session)
/// - Receives photos via PTP/IP events
/// - Stores downloaded photos
/// - (Future) Uploads photos to cloud
///
/// Lifecycle:
/// 1. Created with ActiveCamera → starts event monitoring
/// 2. Receives photos as they're captured
/// 3. User calls end() → disconnects camera, clears photos
///
/// Usage:
/// ```swift
/// // Create session (type-safe: requires ActiveCamera)
/// let session = TransferSession(camera: activeCamera)
///
/// // Photos arrive automatically via events
/// ForEach(session.photos) { photo in
///     Image(uiImage: photo.image!)
/// }
///
/// // End session
/// await session.end()
/// ```
@MainActor
class TransferSession: ObservableObject {

    // MARK: - Published Properties

    /// Downloaded photos (newest first)
    @Published var photos: [CapturedPhoto] = []

    /// Whether session is active
    @Published var isActive: Bool = true

    /// Camera name for display
    @Published private(set) var cameraName: String

    /// Camera IP for display
    @Published private(set) var cameraIP: String

    /// Error message (nil if no error)
    @Published var errorMessage: String? = nil

    /// Count of RAW files skipped this session
    @Published var skippedRawCount: Int = 0

    /// Whether to show the RAW skip banner (user can dismiss)
    @Published var showRawSkipBanner: Bool = true

    // MARK: - Private Properties

    /// The active camera (guaranteed to have open session)
    private var camera: ActiveCamera?

    /// Combine cancellables
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    /// Initialize with an active camera
    /// The camera MUST have an open PTP/IP session
    /// - Parameter camera: ActiveCamera with prepared session
    init(camera: ActiveCamera) {
        self.camera = camera
        self.cameraName = camera.name
        self.cameraIP = camera.ipAddress

        // Set ourselves as the session delegate to receive photos
        camera.session.delegate = self

        // Start event monitoring (begins photo detection)
        camera.startMonitoring()

        print("[TransferSession] Started with camera: \(camera.name)")
    }

    // MARK: - Public Methods

    /// End the transfer session
    /// Disconnects camera and clears all photos
    func end() async {
        guard isActive else { return }

        print("[TransferSession] Ending session...")

        isActive = false

        // Disconnect camera
        if let camera = camera {
            await camera.disconnect()
        }
        camera = nil

        // Clear photos
        photos.removeAll()

        print("[TransferSession] Session ended")
    }

    /// Clear all photos without ending session
    func clearPhotos() {
        photos.removeAll()
        print("[TransferSession] Photos cleared")
    }

    /// Get photo count
    var photoCount: Int {
        photos.count
    }

    /// Check if camera is still connected
    var isCameraConnected: Bool {
        camera?.isConnected ?? false
    }
}

// MARK: - PTPIPSessionDelegate

extension TransferSession: PTPIPSessionDelegate {

    func sessionDidConnect(_ session: PTPIPSession) {
        print("[TransferSession] Session connected")
        // Already connected when TransferSession is created
    }

    func session(_ session: PTPIPSession, didDetectPhoto objectHandle: UInt32) {
        print("[TransferSession] Photo detected: 0x\(String(format: "%08X", objectHandle))")
        // Photo will be downloaded automatically by PTPIPSession
    }

    func session(_ session: PTPIPSession, didDownloadPhoto data: Data, objectHandle: UInt32) {
        // Create CapturedPhoto from downloaded data
        let filename = "IMG_\(String(format: "%08X", objectHandle)).jpg"
        let photo = CapturedPhoto(name: filename, data: data)

        // Add to beginning of array (newest first)
        photos.insert(photo, at: 0)

        print("[TransferSession] Photo added: \(filename) (\(data.count) bytes)")
    }

    func session(_ session: PTPIPSession, didFailWithError error: Error) {
        print("[TransferSession] Session error: \(error.localizedDescription)")
        errorMessage = error.localizedDescription
    }

    func session(_ session: PTPIPSession, didSkipRawFile filename: String) {
        skippedRawCount += 1
        print("[TransferSession] RAW file skipped: \(filename) (total: \(skippedRawCount))")
    }

    func sessionDidDisconnect(_ session: PTPIPSession) {
        print("[TransferSession] Camera disconnected")

        // If session is still supposed to be active, this is unexpected
        if isActive {
            errorMessage = "Camera disconnected unexpectedly"
            isActive = false
            camera = nil
        }
    }
}

// MARK: - Preview Support

#if DEBUG
extension TransferSession {
    /// Create a mock session for previews
    static var preview: TransferSession {
        // Create a minimal mock - in real app this would need a real ActiveCamera
        // For previews, we'll create an empty session and manually populate
        let mockSession = MockTransferSession()
        return mockSession
    }
}

/// Mock transfer session for SwiftUI previews
class MockTransferSession: TransferSession {
    init() {
        // We can't call super.init without a real ActiveCamera
        // So we use a workaround for previews
        fatalError("Use TransferSession.preview factory")
    }
}
#endif
