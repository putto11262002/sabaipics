//
//  PTPIPEventMonitor.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  Event channel monitoring for PTP/IP cameras
//  Based on libgphoto2's event handling with select() pattern
//

import Foundation
import Network
import Combine
import os.lock

// MARK: - Event Monitor Delegate

/// Delegate for PTP/IP event notifications
@MainActor
protocol PTPIPEventMonitorDelegate: AnyObject {
    /// Called when ObjectAdded event is received
    func eventMonitor(_ monitor: PTPIPEventMonitor, didReceiveObjectAdded objectHandle: UInt32)

    /// Called when event monitoring encounters an error
    func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error)

    /// Called when event connection is lost
    func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor)
}

// MARK: - Event Monitor Errors

enum PTPIPEventMonitorError: LocalizedError {
    case notConnected
    case invalidPacket
    case connectionLost
    case timeout

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Event monitor not connected"
        case .invalidPacket: return "Received invalid event packet"
        case .connectionLost: return "Event connection lost"
        case .timeout: return "Event monitoring timeout"
        }
    }
}

// MARK: - Event Monitor
// From libgphoto2: event socket with select() and timeout handling

/// Monitors PTP/IP event channel for camera notifications
/// Uses NWConnection for network I/O with async/await pattern
actor PTPIPEventMonitor {
    weak var delegate: PTPIPEventMonitorDelegate?

    private var eventConnection: NWConnection?
    private var isMonitoring = false
    private var monitorTask: Task<Void, Never>?

    private let receiveTimeout: TimeInterval = 30.0  // 30s timeout (like libgphoto2)

    /// Initialize event monitor
    init() {
        print("[PTPIPEventMonitor] Initialized")
    }

    /// Set the delegate for event callbacks
    /// - Parameter delegate: Delegate to receive event notifications
    func setDelegate(_ delegate: PTPIPEventMonitorDelegate?) {
        self.delegate = delegate
    }

    /// Start monitoring events on the event channel
    /// - Parameter connection: Active NWConnection for event channel
    func startMonitoring(connection: NWConnection) async {
        guard !isMonitoring else {
            print("[PTPIPEventMonitor] Already monitoring")
            return
        }

        self.eventConnection = connection
        self.isMonitoring = true

        print("[PTPIPEventMonitor] Starting event monitoring...")

        // Start async monitoring task
        monitorTask = Task {
            await monitorEventLoop()
        }
    }

    /// Stop monitoring events
    func stopMonitoring() async {
        print("[PTPIPEventMonitor] Stopping event monitoring...")
        isMonitoring = false
        monitorTask?.cancel()
        monitorTask = nil
    }

    /// Main event monitoring loop
    /// Based on libgphoto2's select() pattern with timeout
    private func monitorEventLoop() async {
        print("[PTPIPEventMonitor] Event loop started")

        while isMonitoring {
            do {
                // Read event packet with timeout (like libgphoto2's select)
                guard let eventData = try await receiveEventPacket() else {
                    // Timeout - continue loop (normal behavior)
                    continue
                }

                // Parse and handle event
                try await handleEventPacket(eventData)

            } catch {
                print("[PTPIPEventMonitor] Event monitoring error: \(error)")
                notifyError(error)
                break
            }
        }

        print("[PTPIPEventMonitor] Event loop stopped")
    }

    /// Receive event packet with timeout
    /// Based on libgphoto2's ptpip_read_with_timeout pattern
    private func receiveEventPacket() async throws -> Data? {
        guard let connection = eventConnection else {
            throw PTPIPEventMonitorError.notConnected
        }

        do {
            // First, read header (8 bytes)
            let headerData = try await receiveData(connection: connection, minimumLength: 8, maximumLength: 8)
            guard let header = PTPIPHeader.from(headerData) else {
                throw PTPIPEventMonitorError.invalidPacket
            }

            // Read remaining payload
            let payloadLength = Int(header.length) - 8
            guard payloadLength >= 0 else {
                throw PTPIPEventMonitorError.invalidPacket
            }

            if payloadLength > 0 {
                let payloadData = try await receiveData(connection: connection, minimumLength: payloadLength, maximumLength: payloadLength)
                var fullPacket = headerData
                fullPacket.append(payloadData)
                return fullPacket
            } else {
                return headerData
            }
        } catch PTPIPEventMonitorError.timeout {
            // Timeout is normal - no events received in 30s, just keep waiting
            print("[PTPIPEventMonitor] No events received (timeout), continuing to monitor...")
            return nil
        }
    }

    /// Receive data from connection with timeout
    /// Based on libgphoto2's timeout handling
    /// Fixed: Uses OSAllocatedUnfairLock to prevent race condition in continuation resume
    private func receiveData(connection: NWConnection, minimumLength: Int, maximumLength: Int) async throws -> Data {
        return try await withCheckedThrowingContinuation { continuation in
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            // Timeout task (like libgphoto2's select timeout)
            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(receiveTimeout * 1_000_000_000))

                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    continuation.resume(throwing: PTPIPEventMonitorError.timeout)
                }
            }

            connection.receive(minimumIncompleteLength: minimumLength, maximumLength: maximumLength) { content, _, isComplete, error in
                var shouldResume = false
                var resumeResult: Result<Data, Error>?

                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true

                    if let error = error {
                        resumeResult = .failure(error)
                    } else if isComplete {
                        resumeResult = .failure(PTPIPEventMonitorError.connectionLost)
                    } else if let data = content, !data.isEmpty {
                        resumeResult = .success(data)
                    } else {
                        resumeResult = .failure(PTPIPEventMonitorError.invalidPacket)
                    }
                }

                if shouldResume {
                    timeoutTask.cancel()
                    if let result = resumeResult {
                        switch result {
                        case .success(let data):
                            continuation.resume(returning: data)
                        case .failure(let error):
                            continuation.resume(throwing: error)
                        }
                    }
                }
            }
        }
    }

    /// Handle received event packet
    /// Based on libgphoto2's event parsing
    private func handleEventPacket(_ data: Data) async throws {
        guard let event = PTPIPEventPacket.from(data) else {
            print("[PTPIPEventMonitor] Failed to parse event packet")
            throw PTPIPEventMonitorError.invalidPacket
        }

        guard let eventCode = PTPEventCode(rawValue: event.eventCode) else {
            print("[PTPIPEventMonitor] Unknown event code: 0x\(String(format: "%04X", event.eventCode))")
            return
        }

        // Log transaction ID for debugging
        print("[PTPIPEventMonitor] Received event: \(eventCode) (0x\(String(format: "%04X", event.eventCode))) (txID: \(event.transactionID))")

        switch eventCode {
        case .objectAdded, .canonEOSObjectAddedEx:
            // ObjectAdded: parameter[0] is the object handle
            if let objectHandle = event.parameters.first {
                print("[PTPIPEventMonitor] ObjectAdded: handle=0x\(String(format: "%08X", objectHandle))")
                notifyObjectAdded(objectHandle)
            }

        case .objectRemoved:
            print("[PTPIPEventMonitor] Object removed")

        case .storeFull:
            print("[PTPIPEventMonitor] Storage full")

        case .devicePropChanged, .canonEOSPropValueChanged:
            print("[PTPIPEventMonitor] Property changed")

        default:
            print("[PTPIPEventMonitor] Unhandled event: \(eventCode)")
        }
    }

    /// Notify delegate of ObjectAdded event
    private func notifyObjectAdded(_ objectHandle: UInt32) {
        Task { @MainActor in
            do {
                await delegate?.eventMonitor(self, didReceiveObjectAdded: objectHandle)
            } catch {
                print("[PTPIPEventMonitor] Delegate error in didReceiveObjectAdded: \(error)")
            }
        }
    }

    /// Notify delegate of error
    private func notifyError(_ error: Error) {
        Task { @MainActor in
            do {
                await delegate?.eventMonitor(self, didFailWithError: error)
            } catch {
                print("[PTPIPEventMonitor] Delegate error in didFailWithError: \(error)")
            }
        }
    }

    /// Notify delegate of disconnection
    private func notifyDisconnect() {
        Task { @MainActor in
            do {
                await delegate?.eventMonitorDidDisconnect(self)
            } catch {
                print("[PTPIPEventMonitor] Delegate error in didDisconnect: \(error)")
            }
        }
    }

    /// Clean up resources
    func cleanup() async {
        await stopMonitoring()
        eventConnection = nil
    }
}
