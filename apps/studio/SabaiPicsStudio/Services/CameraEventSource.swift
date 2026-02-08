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
///
/// Two-phase download callbacks for progressive UI:
/// 1. `didDetectPhoto` - Called immediately after ObjectInfo, before download starts
/// 2. `didCompleteDownload` - Called after download finishes
@MainActor
protocol CameraEventSourceDelegate: AnyObject {
    /// Called immediately when photo is detected (before download)
    /// Provides metadata from GetObjectInfo for showing placeholder UI
    func eventSource(
        _ source: CameraEventSource,
        didDetectPhoto objectHandle: UInt32,
        filename: String,
        captureDate: Date,
        fileSize: Int
    )

    /// Called when photo download completes
    func eventSource(
        _ source: CameraEventSource,
        didCompleteDownload objectHandle: UInt32,
        data: Data
    )

    /// Called when a RAW file is skipped (not downloaded)
    func eventSource(_ source: CameraEventSource, didSkipRawFile filename: String)

    /// Called when event monitoring encounters an error
    func eventSource(_ source: CameraEventSource, didFailWithError error: Error)

    /// Called when event source disconnects
    func eventSourceDidDisconnect(_ source: CameraEventSource)
}

// MARK: - Event Source Protocol

/// Protocol for vendor-specific event monitoring
///
/// ## Implementations
/// - `CanonEventSource`: Polling with Canon_EOS_GetEvent (0x9116)
/// - `NikonEventSource`: Polling with Nikon_GetEvent (0x90C7) - stub
/// - `StandardEventSource`: Push events via PTP event channel (Sony, Fuji, etc.)
///
/// ## Architecture
/// Camera brands use different event detection mechanisms:
///
/// **Polling-based (Canon, Nikon):**
/// The event source runs a background task that polls the camera every 50-200ms
/// via the command channel. The camera returns any pending events in the response.
///
/// **Push-based (Sony, Fuji, Olympus):**
/// The event source listens on a dedicated event TCP channel. The camera pushes
/// `ObjectAdded` events automatically when a photo is taken.
///
/// ## Implementation Contract
/// Implementers MUST ensure that `stopMonitoring()` waits for any background
/// tasks to fully complete before returning. This prevents race conditions
/// where resources are cleaned up while the monitoring task is still executing.
///
/// Example pattern:
/// ```swift
/// func stopMonitoring() async {
///     guard isMonitoring else { return }
///     isMonitoring = false
///     monitorTask?.cancel()
///     await monitorTask?.value  // REQUIRED: Wait for task completion
///     monitorTask = nil
/// }
/// ```
@MainActor
protocol CameraEventSource: AnyObject {
    /// Delegate for event callbacks
    var delegate: CameraEventSourceDelegate? { get set }

    /// Start monitoring for camera events
    ///
    /// Spawns a background task that monitors for new photos. The task runs
    /// until `stopMonitoring()` is called.
    ///
    /// - Note: Calling this when already monitoring should be a no-op.
    func startMonitoring() async

    /// Stop monitoring for camera events
    ///
    /// Cancels the background monitoring task and waits for it to fully complete.
    ///
    /// - Important: Implementations MUST await task completion before returning.
    ///   Failure to do so causes race conditions where resources are cleaned up
    ///   while the task is still running, leading to bugs like requiring multiple
    ///   disconnect attempts.
    ///
    /// - Note: Calling this when not monitoring should be a no-op.
    func stopMonitoring() async

    /// Clean up all resources
    ///
    /// Calls `stopMonitoring()` and releases any held references (connections,
    /// delegates, etc.). After cleanup, the event source cannot be reused.
    func cleanup() async

    /// Whether this event source consumes the standard PTP event channel.
    ///
    /// When true, the session should start the event-channel monitor before starting the source.
    var usesEventChannel: Bool { get }
}

extension CameraEventSource {
    var usesEventChannel: Bool { false }
}
