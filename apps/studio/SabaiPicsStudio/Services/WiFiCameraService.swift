//
//  WiFiCameraService.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Swift wrapper for WiFiCameraManager with Combine publishers
//  Updated: 2026-01-19 - Added PTPIPSession support for WiFi cameras
//

import Foundation
import Combine
import Network

/// Swift service that wraps the Objective-C WiFiCameraManager
/// Provides Combine publishers for reactive state management in SwiftUI
/// Conforms to CameraServiceProtocol for dependency injection and testing
/// Now supports both libgphoto2 (legacy) and PTPIPSession (WiFi-only)
@MainActor
class WiFiCameraService: NSObject, ObservableObject, CameraServiceProtocol {

    // MARK: - Published Properties

    /// Whether the camera is currently connected
    @Published var isConnected: Bool = false

    /// Connection error message (nil if no error)
    @Published var connectionError: String? = nil

    /// Detected photos (Phase 3)
    @Published var detectedPhotos: [(filename: String, folder: String)] = []

    /// Downloaded photos with data (Phase 4)
    @Published var downloadedPhotos: [(filename: String, data: Data)] = []

    /// Retry count for UI display (Phase 5)
    @Published var currentRetryCount: Int = 0

    // MARK: - Private Properties

    /// The underlying Objective-C manager (legacy libgphoto2)
    private let manager: WiFiCameraManager

    /// PTP/IP session for WiFi cameras (SAB-27)
    private var ptpSession: PTPIPSession?

    // Task management
    private var connectionTask: Task<Void, Never>?

    // Retry state
    private var retryCount = 0
    private let maxRetries = 3
    private var connectionTimeout: TimeInterval = 15.0  // 15s instead of 90s

    // MARK: - Persistent GUID (like libgphoto2)

    /// Persistent GUID for PTP/IP connections (matches libgphoto2's gp_setting_get/set behavior)
    /// Canon cameras save connection configurations and require the same GUID for reconnection
    private static let guidKey = "com.sabaipics.ptpip.guid"

    /// Get or create persistent GUID for this device
    private var persistentGUID: UUID {
        // Try to load saved GUID
        if let guidString = UserDefaults.standard.string(forKey: Self.guidKey),
           let savedGUID = UUID(uuidString: guidString) {
            return savedGUID
        }

        // Generate new GUID and save it
        let newGUID = UUID()
        UserDefaults.standard.set(newGUID.uuidString, forKey: Self.guidKey)
        return newGUID
    }

    // MARK: - Configuration

    /// Camera configuration parameters
    struct CameraConfig {
        let ip: String
        let model: String
        let proto: String

        /// Default Canon WiFi configuration
        static let canonWiFi = CameraConfig(
            ip: "192.168.1.1",
            model: "Canon EOS (WLAN)",
            proto: "ptpip"
        )
    }

    // MARK: - Initialization

    override init() {
        self.manager = WiFiCameraManager()
        super.init()
        self.manager.delegate = self
    }

    // MARK: - Public Methods

    /// Connect to a WiFi camera
    /// - Parameter config: Camera configuration (defaults to Canon WiFi)
    func connect(config: CameraConfig = .canonWiFi) {

        // Reset error state
        connectionError = nil

        // Cancel any existing connection attempt
        connectionTask?.cancel()

        // Move blocking connection to background thread to keep UI responsive
        connectionTask = Task.detached(priority: .userInitiated) { [weak self] in
            guard let self = self else { return }

            do {
                try self.manager.connect(withIP: config.ip, model: config.model, protocol: config.proto)
                // Success case handled by delegate callback (already on main thread)
            } catch let error as NSError {
                // Update UI state on main thread
                await MainActor.run {
                    self.connectionError = error.localizedDescription
                    self.isConnected = false
                }
            }
        }
    }

    /// Disconnect from the camera
    func disconnect() {
        connectionTask?.cancel()
        connectionTask = nil

        // Disconnect PTP/IP session if active
        if let session = ptpSession {
            Task {
                await session.disconnect()
                self.ptpSession = nil
            }
        }

        // Disconnect legacy manager
        manager.disconnect()

        self.isConnected = false
        self.connectionError = nil
    }

    /// Cancel any pending connection attempt
    func cancelConnection() {
        connectionTask?.cancel()
        connectionTask = nil
    }

    // MARK: - Retry Logic (Phase 5)

    /// Connect with automatic retry on timeout
    func connectWithRetry(config: CameraConfig) {
        retryCount = 0
        attemptConnection(config: config)
    }

    private func attemptConnection(config: CameraConfig) {

        // Update retry count for UI
        DispatchQueue.main.async {
            self.currentRetryCount = self.retryCount
        }

        // Call existing connect method
        connect(config: config)

        // Wait for result with 15s timeout
        DispatchQueue.global().asyncAfter(deadline: .now() + connectionTimeout) { [weak self] in
            guard let self = self else { return }

            DispatchQueue.main.async {
                if self.isConnected {
                    // SUCCESS
                    self.retryCount = 0
                    LocalNetworkPermissionChecker.markPermissionGranted()

                } else if self.retryCount < self.maxRetries - 1 {
                    // RETRY
                    self.retryCount += 1

                    // Exponential backoff: 2s, 5s
                    let backoffDelay: TimeInterval = self.retryCount == 1 ? 2.0 : 5.0

                    DispatchQueue.main.asyncAfter(deadline: .now() + backoffDelay) {
                        self.attemptConnection(config: config)
                    }

                } else {
                    // FAILURE
                    self.retryCount = 0
                    self.connectionError = "Connection failed after 3 attempts. Please check camera WiFi settings."
                }
            }
        }
    }

    /// Cancel any pending retry
    func cancelRetry() {
        retryCount = 0
    }

    // MARK: - PTP/IP Session Methods (SAB-27)

    /// Connect using existing PTP/IP connections (from NetworkScannerService)
    /// This is the preferred method for WiFi cameras (multi-session support)
    /// - Parameters:
    ///   - commandConnection: Established command channel connection
    ///   - eventConnection: Established event channel connection
    ///   - sessionID: Unique session ID for this camera
    func connectWithPTPSession(
        commandConnection: NWConnection,
        eventConnection: NWConnection,
        sessionID: UInt32
    ) async {
        // Reset error state
        connectionError = nil

        // Create new PTP/IP session with persistent GUID
        let guid = persistentGUID  // Use persistent GUID (like libgphoto2)
        let session = PTPIPSession(sessionID: sessionID, guid: guid)
        session.delegate = self
        self.ptpSession = session

        do {
            // Connect using existing connections (no reconnect!)
            try await session.connect(commandConnection: commandConnection, eventConnection: eventConnection)

            // Success
            self.isConnected = true
            self.connectionError = nil

        } catch {
            self.isConnected = false
            self.connectionError = error.localizedDescription
            self.ptpSession = nil
        }
    }

    // MARK: - PTP/IP Direct Connection (SAB-27)

    /// Connect directly via PTP/IP protocol (pure Swift implementation)
    /// This bypasses libgphoto2 and uses the new Swift PTP/IP client
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connectViaPTPIP(ip: String) {
        // Reset error state
        connectionError = nil

        // Cancel any existing connection
        connectionTask?.cancel()

        // Disconnect any existing session first
        if let existingSession = ptpSession {
            Task {
                await existingSession.disconnect()
            }
            ptpSession = nil
        }

        // Create async task for connection
        connectionTask = Task {
            // Create NWConnection objects for command and event channels (port 15740)
            let commandConnection = createConnection(to: ip, port: 15740)
            let eventConnection = createConnection(to: ip, port: 15740)

            do {
                // Start command connection FIRST (per libgphoto2 sequence)
                commandConnection.start(queue: .main)

                // Wait for command connection to be ready
                try await waitForConnection(commandConnection, timeout: 5.0)

                // Note: Event connection will be started by PTPIPSession AFTER Init Command Ack

                // Create PTP/IP session with random session ID and persistent GUID
                let sessionID = UInt32.random(in: 1...UInt32.max)
                let guid = self.persistentGUID  // Use persistent GUID (like libgphoto2)
                let session = PTPIPSession(sessionID: sessionID, guid: guid)
                session.delegate = self
                self.ptpSession = session

                // Connect (will perform Init handshake internally)
                try await session.connect(
                    commandConnection: commandConnection,
                    eventConnection: eventConnection
                )

                // Success - delegate will be notified via sessionDidConnect

            } catch {
                // Cancel connections on failure to clean up TCP sockets
                commandConnection.cancel()
                eventConnection.cancel()

                await MainActor.run {
                    self.isConnected = false
                    self.connectionError = error.localizedDescription
                    self.ptpSession = nil
                }
            }
        }
    }

    // MARK: - Helper Methods

    /// Create NWConnection to camera
    private func createConnection(to ip: String, port: UInt16) -> NWConnection {
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: port)!
        let connection = NWConnection(host: host, port: port, using: .tcp)
        return connection
    }

    /// Wait for NWConnection to reach ready state
    private func waitForConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        try await withTimeout(seconds: timeout) {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                var resumed = false
                connection.stateUpdateHandler = { state in
                    guard !resumed else { return }
                    switch state {
                    case .ready:
                        resumed = true
                        continuation.resume()
                    case .failed(let error):
                        resumed = true
                        continuation.resume(throwing: error)
                    default:
                        break
                    }
                }
            }
        }
    }

    /// Execute async operation with timeout
    private func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw NSError(
                    domain: "WiFiCameraService",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Connection timeout after \(seconds)s"]
                )
            }

            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    // MARK: - CameraServiceProtocol Compatibility Methods

    /// Protocol-compatible connect method (uses new PTP/IP implementation)
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connect(ip: String) {
        // Use new Swift PTP/IP implementation (SAB-27)
        connectViaPTPIP(ip: ip)
    }

    /// Protocol-compatible connect with retry method
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connectWithRetry(ip: String) {
        // Use new Swift PTP/IP implementation (SAB-27)
        // Note: For now, retry logic is built into the PTP/IP timeout handling
        connectViaPTPIP(ip: ip)
    }

}

// MARK: - PTPIPSessionDelegate

extension WiFiCameraService: PTPIPSessionDelegate {

    func sessionDidConnect(_ session: PTPIPSession) {
        self.isConnected = true
        self.connectionError = nil
    }

    func session(_ session: PTPIPSession, didDetectPhoto objectHandle: UInt32) {
        // Photo will be auto-downloaded by PTPIPSession
    }

    func session(_ session: PTPIPSession, didDownloadPhoto data: Data, objectHandle: UInt32) {
        // Generate filename from object handle
        let filename = "PTP_\(String(format: "%08X", objectHandle)).jpg"

        // Add to downloaded photos array
        self.downloadedPhotos.append((filename: filename, data: data))
    }

    func session(_ session: PTPIPSession, didFailWithError error: Error) {
        self.connectionError = error.localizedDescription
    }

    func sessionDidDisconnect(_ session: PTPIPSession) {
        self.isConnected = false
        self.ptpSession = nil

        // Clear downloaded photos on disconnect (don't persist)
        self.downloadedPhotos.removeAll()
        self.detectedPhotos.removeAll()
    }
}

// MARK: - WiFiCameraManagerDelegate

extension WiFiCameraService: WiFiCameraManagerDelegate {

    /// Called when camera successfully connects
    func cameraManagerDidConnect(_ manager: Any) {
        DispatchQueue.main.async {
            self.isConnected = true
            self.connectionError = nil
        }
    }

    /// Called when camera connection or operation fails
    func cameraManager(_ manager: Any, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.isConnected = false
            self.connectionError = error.localizedDescription
        }
    }

    // MARK: - Photo Detection (Phase 3)

    /// Called when a new photo is detected on the camera
    /// Phase 3: FULL IMPLEMENTATION
    /// Phase 4: Added JPEG filtering to skip RAW files
    func cameraManager(_ manager: Any, didDetectNewPhoto filename: String, folder: String) {

        // Filter: Only process JPEG files, skip RAW
        let lowercased = filename.lowercased()
        let isRAW = lowercased.hasSuffix(".cr2") ||
                    lowercased.hasSuffix(".cr3") ||
                    lowercased.hasSuffix(".nef") ||
                    lowercased.hasSuffix(".arw") ||
                    lowercased.hasSuffix(".dng")

        let isJPEG = lowercased.hasSuffix(".jpg") ||
                     lowercased.hasSuffix(".jpeg")

        guard isJPEG && !isRAW else {
            return
        }

        // Add to detected photos array
        DispatchQueue.main.async {
            self.detectedPhotos.append((filename: filename, folder: folder))
        }
    }

    // MARK: - Photo Download (Phase 4)

    /// Called when photo download completes
    /// Phase 4: Sequential download implementation
    func cameraManager(_ manager: Any, didDownloadPhoto photoData: Data, filename: String) {
        // Add to downloaded photos array (on main thread)
        DispatchQueue.main.async {
            self.downloadedPhotos.append((filename: filename, data: photoData))
        }
    }
}
