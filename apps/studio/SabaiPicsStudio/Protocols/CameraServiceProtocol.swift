//
//  CameraServiceProtocol.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Protocol definition for camera service layer
//  Enables dependency injection for testing without hardware
//

import Foundation
import Combine

/// Protocol defining the camera service interface
/// Implemented by both real WiFi service and mock service for testing
protocol CameraServiceProtocol: AnyObject, ObservableObject {

    // MARK: - Published Properties

    /// Whether the camera is currently connected
    var isConnected: Bool { get }

    /// Connection error message (nil if no error)
    var connectionError: String? { get }

    /// Detected photos (filename, folder)
    var detectedPhotos: [(filename: String, folder: String)] { get }

    /// Downloaded photos with data (filename, data)
    var downloadedPhotos: [(filename: String, data: Data)] { get }

    /// Retry count for UI display
    var currentRetryCount: Int { get }

    // MARK: - Methods

    /// Connect to a WiFi camera with specified IP address
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connect(ip: String)

    /// Connect to a WiFi camera with automatic retry on timeout
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connectWithRetry(ip: String)

    /// Disconnect from the camera
    func disconnect()

    /// Cancel any pending connection attempt
    func cancelConnection()

    /// Cancel any pending retry
    func cancelRetry()
}

// MARK: - Default Implementations

extension CameraServiceProtocol {
    /// Default connect with retry delegates to connect
    func connectWithRetry(ip: String) {
        connect(ip: ip)
    }

    /// Default cancel retry (no-op for simple implementations)
    func cancelRetry() {
        // No-op by default
    }
}
