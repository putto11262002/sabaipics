//
//  MockCameraService.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Mock camera service for testing and SwiftUI previews
//  Simulates camera behavior without real hardware
//

import Foundation
import Combine
import SwiftUI

/// Mock implementation of CameraServiceProtocol for testing
/// Simulates connection, photo detection, and downloads without real camera hardware
class MockCameraService: ObservableObject, CameraServiceProtocol {

    // MARK: - Published Properties

    @Published var isConnected: Bool = false
    @Published var connectionError: String? = nil
    @Published var detectedPhotos: [(filename: String, folder: String)] = []
    @Published var downloadedPhotos: [(filename: String, data: Data)] = []
    @Published var currentRetryCount: Int = 0

    // MARK: - Private Properties

    private var connectionTask: Task<Void, Never>?
    private var shouldSucceed: Bool = true

    // MARK: - Initialization

    init() {
        print("🧪 [MockCameraService] Initialized")
    }

    // MARK: - CameraServiceProtocol Methods

    func connect(ip: String) {
        print("🧪 [MockCameraService] Connecting to \(ip)...")
        connectionError = nil

        // Cancel any existing connection
        connectionTask?.cancel()

        // Simulate connection with configurable delay
        connectionTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second delay

            if shouldSucceed {
                print("🧪 [MockCameraService] Connection successful")
                isConnected = true
                connectionError = nil
            } else {
                print("🧪 [MockCameraService] Connection failed")
                isConnected = false
                connectionError = "Mock connection failed (simulated)"
            }
        }
    }

    func connectWithRetry(ip: String) {
        print("🧪 [MockCameraService] Connecting with retry to \(ip)...")
        currentRetryCount = 0
        connect(ip: ip)
    }

    func disconnect() {
        print("🧪 [MockCameraService] Disconnecting...")
        connectionTask?.cancel()
        connectionTask = nil

        isConnected = false
        connectionError = nil
        detectedPhotos.removeAll()
        downloadedPhotos.removeAll()
        currentRetryCount = 0
    }

    func cancelConnection() {
        print("🧪 [MockCameraService] Canceling connection...")
        connectionTask?.cancel()
        connectionTask = nil
    }

    func cancelRetry() {
        print("🧪 [MockCameraService] Canceling retry...")
        currentRetryCount = 0
        connectionTask?.cancel()
    }

    // MARK: - Public Test Helper Methods

    /// Simulate a connection with configurable success/failure
    /// - Parameters:
    ///   - success: Whether the connection should succeed
    ///   - delay: Time delay before completing (in seconds)
    func simulateConnection(success: Bool, delay: TimeInterval = 1.0) {
        shouldSucceed = success
        connectionTask?.cancel()

        connectionTask = Task { @MainActor in
            if delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }

            if success {
                print("🧪 [MockCameraService] Simulated connection SUCCESS")
                isConnected = true
                connectionError = nil
            } else {
                print("🧪 [MockCameraService] Simulated connection FAILURE")
                isConnected = false
                connectionError = "Simulated connection error for testing"
            }
        }
    }

    /// Simulate a photo detection event
    /// - Parameters:
    ///   - filename: Photo filename
    ///   - folder: Folder path on camera
    func simulatePhotoDetection(filename: String, folder: String = "/DCIM/100CANON") {
        print("🧪 [MockCameraService] Simulating photo detection: \(filename)")
        detectedPhotos.append((filename: filename, folder: folder))
    }

    /// Simulate a photo download completion
    /// - Parameters:
    ///   - filename: Photo filename
    ///   - data: Photo data (use test image data or generate dummy data)
    func simulatePhotoDownload(filename: String, data: Data) {
        print("🧪 [MockCameraService] Simulating photo download: \(filename), size: \(data.count) bytes")
        downloadedPhotos.append((filename: filename, data: data))
    }

    /// Simulate a photo download with auto-generated test image
    /// - Parameter filename: Photo filename
    func simulatePhotoDownload(filename: String) {
        let testImageData = generateTestImageData()
        simulatePhotoDownload(filename: filename, data: testImageData)
    }

    /// Simulate disconnection
    func simulateDisconnect() {
        print("🧪 [MockCameraService] Simulating disconnect")
        isConnected = false
        connectionError = nil
    }

    /// Simulate retry count increment (for testing retry UI)
    /// - Parameter count: Retry count to set
    func simulateRetryCount(_ count: Int) {
        print("🧪 [MockCameraService] Simulating retry count: \(count)")
        currentRetryCount = count
    }

    /// Simulate connection error
    /// - Parameter message: Error message to display
    func simulateError(_ message: String) {
        print("🧪 [MockCameraService] Simulating error: \(message)")
        isConnected = false
        connectionError = message
    }

    // MARK: - Private Helper Methods

    /// Generate a simple test image data (1x1 red pixel PNG)
    private func generateTestImageData() -> Data {
        // Create a 1x1 red image
        let size = CGSize(width: 100, height: 100)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(origin: .zero, size: size))

            // Draw a simple pattern
            UIColor.white.setStroke()
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: size.width, y: size.height))
            path.move(to: CGPoint(x: size.width, y: 0))
            path.addLine(to: CGPoint(x: 0, y: size.height))
            path.lineWidth = 2
            path.stroke()
        }

        return image.jpegData(compressionQuality: 0.8) ?? Data()
    }
}

// MARK: - Preview Helpers

extension MockCameraService {
    /// Create a mock service in connected state with sample photos
    static func connectedWithPhotos() -> MockCameraService {
        let service = MockCameraService()
        service.isConnected = true

        // Add sample photos
        service.simulatePhotoDownload(filename: "IMG_001.JPG")
        service.simulatePhotoDownload(filename: "IMG_002.JPG")
        service.simulatePhotoDownload(filename: "IMG_003.JPG")

        return service
    }

    /// Create a mock service in connecting state
    static func connecting() -> MockCameraService {
        let service = MockCameraService()
        service.simulateConnection(success: true, delay: 5.0) // Long delay
        return service
    }

    /// Create a mock service in error state
    static func withError() -> MockCameraService {
        let service = MockCameraService()
        service.simulateError("Failed to connect to camera. Please check WiFi settings.")
        return service
    }

    /// Create a mock service in retrying state
    static func retrying() -> MockCameraService {
        let service = MockCameraService()
        service.simulateRetryCount(2)
        service.simulateConnection(success: true, delay: 3.0)
        return service
    }
}
