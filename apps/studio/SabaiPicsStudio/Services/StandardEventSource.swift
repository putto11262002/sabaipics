//
//  StandardEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-20
//  Standard PTP event channel implementation (push events)
//  Wraps PTPIPEventMonitor for use with CameraEventSource protocol
//
//  Used by: Sony, Fuji, Olympus, Panasonic, and other cameras that use
//  standard PTP event channel (not vendor-specific polling)
//
//  TODO: Validate with actual Sony camera - standard PTP event format
//  TODO: Verify ObjectAdded event parameters match expected format
//  TODO: Test connection stability with long-running sessions
//

import Foundation
import Network

// MARK: - Standard Event Source

/// Standard PTP event channel implementation
/// Wraps PTPIPEventMonitor for cameras that push events (not poll)
/// Used for Sony, Fuji, Olympus, Panasonic, etc.
@MainActor
class StandardEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    // Internal monitor (existing implementation)
    private let eventMonitor: PTPIPEventMonitor
    private weak var eventConnection: NWConnection?
    private weak var photoOps: PhotoOperationsProvider?

    /// Initialize standard event source
    /// - Parameters:
    ///   - eventConnection: Event channel connection
    ///   - photoOps: Provider for photo operations (getObjectInfo, downloadPhoto)
    init(eventConnection: NWConnection?, photoOps: PhotoOperationsProvider?) {
        self.eventMonitor = PTPIPEventMonitor()
        self.eventConnection = eventConnection
        self.photoOps = photoOps
    }

    // MARK: - CameraEventSource Protocol

    func startMonitoring() async {
        guard let connection = eventConnection else {
            print("[StandardEventSource] No event connection available")
            return
        }

        // Set ourselves as the monitor's delegate to bridge callbacks
        await eventMonitor.setDelegate(self)
        await eventMonitor.startMonitoring(connection: connection)
        print("[StandardEventSource] Standard event monitoring started")
    }

    func stopMonitoring() async {
        await eventMonitor.stopMonitoring()
        print("[StandardEventSource] Standard event monitoring stopped")
    }

    func cleanup() async {
        await stopMonitoring()
        await eventMonitor.cleanup()
        eventConnection = nil
        photoOps = nil
    }
}

// MARK: - PTPIPEventMonitorDelegate

/// Bridge from PTPIPEventMonitor callbacks to CameraEventSourceDelegate
extension StandardEventSource: PTPIPEventMonitorDelegate {
    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didReceiveObjectAdded objectHandle: UInt32) {
        Task { @MainActor in
            print("[StandardEventSource] Photo detected: 0x\(String(format: "%08X", objectHandle))")

            // Notify delegate
            delegate?.eventSource(self, didDetectPhoto: objectHandle)

            // Auto-download photo when detected
            // TODO: Add RAW filtering like CanonEventSource for consistency
            // For now, download everything (matching original behavior)
            guard let photoOps = photoOps else { return }

            do {
                let photoData = try await photoOps.downloadPhoto(objectHandle: objectHandle)
                print("[StandardEventSource] Photo 0x\(String(format: "%08X", objectHandle)) downloaded (\(photoData.count) bytes)")
            } catch {
                print("[StandardEventSource] Photo download failed: \(error)")
                delegate?.eventSource(self, didFailWithError: error)
            }
        }
    }

    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error) {
        Task { @MainActor in
            delegate?.eventSource(self, didFailWithError: error)
        }
    }

    nonisolated func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor) {
        Task { @MainActor in
            delegate?.eventSourceDidDisconnect(self)
        }
    }
}
