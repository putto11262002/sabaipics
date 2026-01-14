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

    // MARK: - Private Properties

    /// The underlying Objective-C manager
    private let manager: WiFiCameraManager

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

        // Call Objective-C method with error handling
        do {
            try manager.connect(withIP: config.ip, model: config.model, protocol: config.proto)
            // Success case is handled by delegate callback
        } catch let error as NSError {
            let errorMsg = error.localizedDescription
            print("❌ [WiFiCameraService] Connection failed: \(errorMsg)")

            DispatchQueue.main.async {
                self.connectionError = errorMsg
                self.isConnected = false
            }
        }
    }

    /// Disconnect from the camera
    func disconnect() {
        print("📱 [WiFiCameraService] Disconnecting from WiFi camera")
        manager.disconnect()

        DispatchQueue.main.async {
            self.isConnected = false
            self.connectionError = nil
        }
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
    func cameraManager(_ manager: Any, didDetectNewPhoto filename: String, folder: String) {
        print("📸 [WiFiCameraService] Photo detected in Swift: \(filename)")
        DispatchQueue.main.async {
            self.detectedPhotos.append((filename: filename, folder: folder))
        }
    }

    // MARK: - Photo Download (Phase 4)

    /// Called when photo download completes
    /// Phase 4: Will implement photo download
    func cameraManager(_ manager: Any, didDownloadPhoto photoData: Data, filename: String) {
        print("📥 [WiFiCameraService] Photo downloaded: \(filename), size: \(photoData.count) bytes")
        // Phase 4: Implement photo download logic
    }
}
