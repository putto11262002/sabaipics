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

            guard let photoOps = photoOps else { return }

            do {
                // Get object info to check file type and metadata
                let objectInfo = try await photoOps.getObjectInfo(objectHandle: objectHandle)

                // Skip RAW files (matching Canon behavior)
                if objectInfo.isRawFile {
                    print("[StandardEventSource] Skipping RAW file: \(objectInfo.filename)")
                    delegate?.eventSource(self, didSkipRawFile: objectInfo.filename)
                    return
                }

                // Only download JPEG files
                if objectInfo.isJpegFile {
                    print("[StandardEventSource] Downloading JPEG: \(objectInfo.filename)")

                    // Phase 1: Notify photo detected with metadata (before download)
                    // Note: PTP captureDate is a string, use current time as approximation
                    delegate?.eventSource(
                        self,
                        didDetectPhoto: objectHandle,
                        filename: objectInfo.filename,
                        captureDate: Date(), // Use current time since PTP date is string format
                        fileSize: Int(objectInfo.objectCompressedSize)
                    )

                    // Phase 2: Download photo
                    let photoData = try await photoOps.downloadPhoto(objectHandle: objectHandle)
                    print("[StandardEventSource] Photo 0x\(String(format: "%08X", objectHandle)) downloaded (\(photoData.count) bytes)")

                    // Phase 3: Notify download complete
                    delegate?.eventSource(
                        self,
                        didCompleteDownload: objectHandle,
                        data: photoData
                    )
                } else {
                    // Unknown format - log and skip
                    print("[StandardEventSource] Skipping unknown format: \(objectInfo.filename)")
                }
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
