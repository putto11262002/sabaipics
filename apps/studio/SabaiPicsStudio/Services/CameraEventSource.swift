//
//  CameraEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-20
//  Protocol for vendor-specific camera event handling
//  Abstracts Canon polling, Nikon polling, and standard PTP push events
//

import Foundation
import Network

// MARK: - Event Source Delegate

/// Delegate for camera event notifications
/// Used by PTPIPSession to receive events from any vendor implementation
@MainActor
protocol CameraEventSourceDelegate: AnyObject {
    /// Called when a photo is detected and ready to download
    func eventSource(_ source: CameraEventSource, didDetectPhoto objectHandle: UInt32)

    /// Called when a RAW file is skipped (not downloaded)
    func eventSource(_ source: CameraEventSource, didSkipRawFile filename: String)

    /// Called when event monitoring encounters an error
    func eventSource(_ source: CameraEventSource, didFailWithError error: Error)

    /// Called when event source disconnects
    func eventSourceDidDisconnect(_ source: CameraEventSource)
}

// MARK: - Event Source Protocol

/// Protocol for vendor-specific event monitoring
/// Implementations:
/// - CanonEventSource: Polling with Canon_EOS_GetEvent (0x9116)
/// - NikonEventSource: Polling with Nikon_GetEvent (0x90C7) - stub
/// - StandardEventSource: Push events via PTP event channel (Sony, etc.)
@MainActor
protocol CameraEventSource: AnyObject {
    /// Delegate for event callbacks
    var delegate: CameraEventSourceDelegate? { get set }

    /// Start monitoring for camera events
    func startMonitoring() async

    /// Stop monitoring for camera events
    func stopMonitoring() async

    /// Clean up resources
    func cleanup() async
}
