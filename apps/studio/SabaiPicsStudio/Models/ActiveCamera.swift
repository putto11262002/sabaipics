//
//  ActiveCamera.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  Transfer Session Architecture - Core Type
//
//  Represents a camera with an ACTIVE PTP/IP session (OpenSession completed).
//  This is the ONLY type that can be used to create a TransferSession.
//  Type safety ensures we cannot transfer photos without an established session.
//

import Foundation

/// Camera with an active PTP/IP session
///
/// This type can only be created when a camera has successfully completed:
/// 1. TCP connection (command + event channels)
/// 2. PTP/IP Init handshake
/// 3. OpenSession command
/// 4. SetEventMode (for Canon)
///
/// Both auto-discovery and manual IP paths must produce this type
/// before a TransferSession can be created.
///
/// Usage:
/// ```swift
/// // From discovered camera (session already prepared)
/// guard let session = discoveredCamera.session else { return }
/// let activeCamera = ActiveCamera(
///     name: discoveredCamera.name,
///     ipAddress: discoveredCamera.ipAddress,
///     session: session
/// )
///
/// // Now create transfer session
/// let transfer = TransferSession(camera: activeCamera)
/// ```
struct ActiveCamera {
    /// Camera display name (e.g., "Canon EOS R5")
    let name: String

    /// Camera IP address (e.g., "172.20.10.2")
    let ipAddress: String

    /// Active PTP/IP session (OpenSession completed, ready for commands)
    let session: PTPIPSession

    /// Camera manufacturer (derived from name)
    var manufacturer: CameraManufacturer {
        let lowercased = name.lowercased()
        if lowercased.contains("canon") || lowercased.contains("eos") {
            return .canon
        } else if lowercased.contains("nikon") {
            return .nikon
        } else if lowercased.contains("sony") {
            return .sony
        } else {
            return .canon // Default
        }
    }

    /// Display string for UI
    var displayName: String {
        "\(name) (\(ipAddress))"
    }

    // MARK: - Session Control

    /// Start event monitoring (begins photo detection)
    /// Call this when TransferSession takes ownership
    @MainActor
    func startMonitoring() {
        session.startEventMonitoring()
    }

    /// Gracefully disconnect from camera
    /// Sends CloseSession command and closes TCP connections
    @MainActor
    func disconnect() async {
        await session.disconnect()
    }

    /// Check if session is still connected
    @MainActor
    var isConnected: Bool {
        session.connected
    }
}

// MARK: - Factory Methods

extension ActiveCamera {

    /// Create from a discovered camera that has a prepared session
    /// Returns nil if session is not ready
    /// - Parameter camera: DiscoveredCamera from network scan
    /// - Returns: ActiveCamera if session is prepared, nil otherwise
    @MainActor
    static func from(_ camera: DiscoveredCamera) -> ActiveCamera? {
        guard let session = camera.session, session.connected else {
            return nil
        }

        return ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )
    }
}
