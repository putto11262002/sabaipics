//
//  WiFiCameraService.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Swift wrapper for WiFiCameraManager with Combine publishers
//

import Foundation
import Combine

/// Swift service that wraps the Objective-C WiFiCameraManager
/// Provides Combine publishers for reactive state management in SwiftUI
class WiFiCameraService: NSObject, ObservableObject {

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

    /// The underlying Objective-C manager
    private let manager: WiFiCameraManager

    // Task management
    private var connectionTask: Task<Void, Never>?

    // Retry state
    private var retryCount = 0
    private let maxRetries = 3
    private var connectionTimeout: TimeInterval = 15.0  // 15s instead of 90s

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

        print("📱 [WiFiCameraService] Initialized")
    }

    // MARK: - Public Methods

    /// Connect to a WiFi camera
    /// - Parameter config: Camera configuration (defaults to Canon WiFi)
    func connect(config: CameraConfig = .canonWiFi) {
        print("📱 [WiFiCameraService] Connecting to WiFi camera: \(config.ip)")

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
                let errorMsg = error.localizedDescription
                print("❌ [WiFiCameraService] Connection failed: \(errorMsg)")

                // Update UI state on main thread
                await MainActor.run {
                    self.connectionError = errorMsg
                    self.isConnected = false
                }
            }
        }
    }

    /// Disconnect from the camera
    func disconnect() {
        print("📱 [WiFiCameraService] Disconnecting from WiFi camera")
        connectionTask?.cancel()
        connectionTask = nil
        manager.disconnect()

        DispatchQueue.main.async {
            self.isConnected = false
            self.connectionError = nil
        }
    }

    /// Cancel any pending connection attempt
    func cancelConnection() {
        connectionTask?.cancel()
        connectionTask = nil
    }

    // MARK: - Retry Logic (Phase 5)

    /// Connect with automatic retry on timeout
    func connectWithRetry(config: CameraConfig) {
        print("📡 [WiFiCameraService] Starting connection with retry...")
        retryCount = 0
        attemptConnection(config: config)
    }

    private func attemptConnection(config: CameraConfig) {
        print("📡 [WiFiCameraService] Connection attempt \(retryCount + 1)/\(maxRetries)")

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
                    print("✅ [WiFiCameraService] Connection succeeded on attempt \(self.retryCount + 1)")
                    self.retryCount = 0
                    LocalNetworkPermissionChecker.markPermissionGranted()

                } else if self.retryCount < self.maxRetries - 1 {
                    // RETRY
                    self.retryCount += 1

                    // Exponential backoff: 2s, 5s
                    let backoffDelay: TimeInterval = self.retryCount == 1 ? 2.0 : 5.0
                    print("⏳ [WiFiCameraService] Retry in \(backoffDelay)s... (Attempt \(self.retryCount + 1)/\(self.maxRetries))")

                    DispatchQueue.main.asyncAfter(deadline: .now() + backoffDelay) {
                        self.attemptConnection(config: config)
                    }

                } else {
                    // FAILURE
                    print("❌ [WiFiCameraService] Connection failed after \(self.maxRetries) attempts")
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

}

// MARK: - WiFiCameraManagerDelegate

extension WiFiCameraService: WiFiCameraManagerDelegate {

    /// Called when camera successfully connects
    func cameraManagerDidConnect(_ manager: Any) {
        print("✅ [WiFiCameraService] Connected to camera via WiFi")

        DispatchQueue.main.async {
            self.isConnected = true
            self.connectionError = nil
        }
    }

    /// Called when camera connection or operation fails
    func cameraManager(_ manager: Any, didFailWithError error: Error) {
        print("❌ [WiFiCameraService] Camera connection failed: \(error.localizedDescription)")

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
        print("📸 [WiFiCameraService] Photo detected in Swift: \(filename)")

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
            print("⏭️ Skipping non-JPEG file: \(filename)")
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
        print("✅ [WiFiCameraService] Photo downloaded: \(filename), size: \(photoData.count) bytes")

        // Add to downloaded photos array (on main thread)
        DispatchQueue.main.async {
            self.downloadedPhotos.append((filename: filename, data: photoData))
        }
    }
}
