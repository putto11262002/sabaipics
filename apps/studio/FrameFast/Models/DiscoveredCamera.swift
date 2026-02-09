//
//  DiscoveredCamera.swift
//  FrameFast
//
//  Created: 2026-01-19
//  Updated: 2026-01-19 - Transfer Session Architecture
//
//  Represents a camera found during network scanning.
//  Holds a PREPARED PTP/IP session (OpenSession + SetEventMode done)
//  but NOT yet polling for events.
//
//  When user selects this camera:
//  1. Session is extracted and wrapped in ActiveCamera
//  2. ActiveCamera is passed to capture session controller
//  3. CaptureSessionController starts event monitoring
//
//  Non-selected cameras are disconnected during cleanup.
//

import Foundation
import Network

/// Camera discovered during network scan
///
/// Lifecycle:
/// 1. NetworkScannerService finds camera via PTP/IP handshake
/// 2. Scanner prepares session (OpenSession + SetEventMode)
/// 3. DiscoveredCamera holds the prepared session
/// 4. User selects camera → session extracted → ActiveCamera created
/// 5. Other DiscoveredCameras are disconnected
///
/// The session is "prepared but not polling" - ready for instant activation.
class DiscoveredCamera: Identifiable, Equatable {

    /// Unique identifier for SwiftUI list
    let id: UUID

    /// Camera name from PTP/IP Init Ack (e.g., "Canon EOS R5")
    let name: String

    /// IP address of the camera (e.g., "172.20.10.2")
    let ipAddress: String

    /// Connection number from Init Command Ack
    let connectionNumber: UInt32

    /// Prepared PTP/IP session (OpenSession done, NOT polling yet)
    /// This is transferred to ActiveCamera when user selects this camera
    /// After transfer, this becomes nil
    var session: PTPIPSession?

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
            return .canon // Default to Canon for unknown
        }
    }

    // MARK: - Initialization

    /// Initialize discovered camera
    /// - Parameters:
    ///   - name: Camera name from PTP/IP Init Ack
    ///   - ipAddress: IP address of the camera
    ///   - connectionNumber: Connection number from Init Command Ack
    ///   - session: Prepared PTPIPSession (OpenSession done, not polling)
    init(
        name: String,
        ipAddress: String,
        connectionNumber: UInt32,
        session: PTPIPSession?
    ) {
        self.id = UUID()
        self.name = name
        self.ipAddress = ipAddress
        self.connectionNumber = connectionNumber
        self.session = session
    }

    // MARK: - Session Status

    /// Check if session is ready (connected and prepared)
    /// Must be called from MainActor since PTPIPSession is MainActor-isolated
    @MainActor
    var hasActiveSession: Bool {
        return session?.connected ?? false
    }

    /// Check if this camera can be selected (has prepared session)
    @MainActor
    var canSelect: Bool {
        return hasActiveSession
    }

    // MARK: - Session Transfer

    /// Extract session for transfer to ActiveCamera
    /// Returns the session and clears it from this camera
    /// - Returns: The prepared session, or nil if not available
    @MainActor
    func extractSession() -> PTPIPSession? {
        let extracted = session
        session = nil
        return extracted
    }

    // MARK: - Cleanup

    /// Disconnect session and clean up
    /// Call this when camera is no longer needed (user selected different camera)
    @MainActor
    func disconnect() async {
        if let session = session {
            await session.disconnect()
        }
        session = nil
    }

    // MARK: - Equatable

    static func == (lhs: DiscoveredCamera, rhs: DiscoveredCamera) -> Bool {
        // Compare by IP address (camera identity)
        return lhs.ipAddress == rhs.ipAddress
    }
}

// MARK: - Display Helpers

extension DiscoveredCamera {
    /// Display string for UI (e.g., "Canon EOS R5 (172.20.10.2)")
    var displayName: String {
        return "\(name) (\(ipAddress))"
    }

    /// Short display string for compact UI
    var shortDisplayName: String {
        return name
    }
}
