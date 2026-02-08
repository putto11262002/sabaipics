//
//  NikonEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-20
//  Nikon event polling implementation
//
//  Nikon cameras require polling with Nikon_GetEvent (0x90C7) on the command channel.
//  Event payload format (from libgphoto2 ptp-pack.c ptp_unpack_Nikon_EC):
//    u16 count
//    repeated count times:
//      u16 eventCode
//      u32 param1
//

import Foundation
import Network

@MainActor
final class NikonEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    // Dependencies
    private weak var session: PTPIPSession?

    // Polling state
    private var pollingTask: Task<Void, Never>?
    private var isMonitoring = false

    // Adaptive polling intervals (match Canon pattern)
    private var pollInterval: TimeInterval = 0.05
    private let minPollInterval: TimeInterval = 0.05
    private let maxPollInterval: TimeInterval = 0.2

    // Basic de-dupe (Nikon may emit multiple notifications per capture)
    private var seenHandles = Set<UInt32>()

    // Nikon event codes (libgphoto2: ptp.h)
    //
    // Observed behavior (Nikon Z6, WiFi PTP/IP): Nikon_GetEvent (0x90C7) returns
    // standard PTP event codes (0x400x) like ObjectAdded (0x4002) and CaptureComplete
    // (0x400D), not only Nikon-specific 0xC1xx codes. This means:
    // - Some Nikon bodies/modes may require polling (hence this event source)
    // - Even when polling, we must treat standard 0x4002 as "new object".
    private let ptpObjectAdded: UInt16 = 0x4002
    private let nikonObjectAddedInSDRAM: UInt16 = 0xC101

    init(
        session: PTPIPSession
    ) {
        self.session = session
    }

    // MARK: - CameraEventSource

    func startMonitoring() async {
        guard !isMonitoring else { return }
        isMonitoring = true

        pollingTask = Task { [weak self] in
            await self?.pollingLoop()
        }
    }

    func stopMonitoring() async {
        guard isMonitoring else { return }
        isMonitoring = false
        pollingTask?.cancel()
        await pollingTask?.value
        pollingTask = nil
    }

    func cleanup() async {
        await stopMonitoring()
        session = nil
        seenHandles.removeAll()
    }

    // MARK: - Polling

    private func pollingLoop() async {
        pollInterval = minPollInterval
        PTPLogger.info("Nikon polling started (50-200ms)", category: PTPLogger.event)

        while isMonitoring {
            do {
                let foundEvents = try await pollNikonEvent()

                if foundEvents {
                    pollInterval = minPollInterval
                    continue
                }

                try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))

                let newInterval = min(pollInterval + 0.05, maxPollInterval)
                pollInterval = newInterval
            } catch is CancellationError {
                break
            } catch {
                PTPLogger.error("Nikon poll error: \(error)", category: PTPLogger.event)
                delegate?.eventSource(self, didFailWithError: error)
                try? await Task.sleep(nanoseconds: UInt64(maxPollInterval * 1_000_000_000))
            }
        }

        PTPLogger.info("Nikon polling stopped", category: PTPLogger.event)
    }

    private func pollNikonEvent() async throws -> Bool {
        guard let session else { return false }

        // Execute Nikon_GetEvent (0x90C7) as a single serialized command-channel operation.
        // Note: we treat session-level timeouts as "no events" for this poll iteration.
        let response: (data: Data?, response: PTPIPOperationResponse)
        do {
            response = try await session.executeOperation { command in
                command.nikonGetEvent()
            }
        } catch PTPIPSessionError.timeout {
            return false
        }

        guard let eventData = response.data, !eventData.isEmpty else {
            return false
        }

        let handles = parseNikonEvents(eventData)
        if handles.isEmpty {
            return false
        }

        for handle in handles {
            if Task.isCancelled { break }
            session.enqueueObjectHandle(handle)
        }

        return true
    }

    // MARK: - Nikon event parsing

    private func parseNikonEvents(_ data: Data) -> [UInt32] {
        // Format from libgphoto2 ptp_unpack_Nikon_EC
        // u16 count, then count entries of 6 bytes: u16 code, u32 param1

        PTPLogger.data(data, caption: "nikon/getevent/data", category: PTPLogger.event)

        guard data.count >= 2 else { return [] }

        let cntLE: UInt16 = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt16.self) }
        let count = Int(UInt16(littleEndian: cntLE))
        if count == 0 { return [] }

        let maxCount = (data.count - 2) / 6
        if count > maxCount {
            PTPLogger.debug("Nikon GetEvent invalid count=\(count) max=\(maxCount)", category: PTPLogger.event)
            return []
        }

        var handles: [UInt32] = []
        handles.reserveCapacity(count)

        for i in 0..<count {
            let base = 2 + i * 6
            let codeLE: UInt16 = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: base, as: UInt16.self) }
            let param1LE: UInt32 = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: base + 2, as: UInt32.self) }

            let code = UInt16(littleEndian: codeLE)
            let param1 = UInt32(littleEndian: param1LE)

            // Photo events: standard ObjectAdded (0x4002) or Nikon ObjectAddedInSDRAM (0xC101).
            // In both cases param1 is the object handle.
            if (code == ptpObjectAdded || code == nikonObjectAddedInSDRAM), param1 != 0 {
                if seenHandles.contains(param1) {
                    continue
                }
                seenHandles.insert(param1)
                PTPLogger.info("Nikon photo detected: handle=\(PTPLogger.formatHex(param1))", category: PTPLogger.event)
                handles.append(param1)
            } else {
                PTPLogger.debug(
                    "Nikon event code=\(PTPLogger.formatHex(code)) param1=\(PTPLogger.formatHex(param1))",
                    category: PTPLogger.event
                )
            }
        }

        return handles
    }

    // Photo downloads are handled by the session unified photo pipeline.
}

enum NikonEventSourceError: LocalizedError {
    case invalidResponse
    case transactionMismatch
    case connectionClosed
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid response from Nikon camera"
        case .transactionMismatch: return "Transaction ID mismatch"
        case .connectionClosed: return "Connection closed"
        case .timeout: return "Timed out waiting for camera"
        }
    }
}
