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
    private weak var commandConnection: NWConnection?
    private weak var transactionManager: PTPTransactionManager?
    private let commandQueue: PTPIPCommandQueue
    private weak var photoOps: PhotoOperationsProvider?

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
        commandConnection: NWConnection?,
        transactionManager: PTPTransactionManager?,
        commandQueue: PTPIPCommandQueue,
        photoOps: PhotoOperationsProvider?
    ) {
        self.commandConnection = commandConnection
        self.transactionManager = transactionManager
        self.commandQueue = commandQueue
        self.photoOps = photoOps
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
        commandConnection = nil
        transactionManager = nil
        photoOps = nil
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
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            return false
        }

        // Serialize the entire transaction on the shared command socket.
        let response = try await commandQueue.run { () async throws -> (data: Data?, response: PTPIPOperationResponse) in
            var command = await txManager.createCommand()
            let getEventCommand = command.nikonGetEvent()
            let commandData = getEventCommand.toData()

            try await Self.sendData(connection: connection, data: commandData)
            return try await Self.receiveDataAndResponse(connection: connection, expectedTransactionID: getEventCommand.transactionID)
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
            await processPhotoHandle(handle)
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

    private func processPhotoHandle(_ handle: UInt32) async {
        guard let photoOps else { return }

        do {
            let objectInfo = try await photoOps.getObjectInfo(objectHandle: handle)

            if objectInfo.isRawFile {
                delegate?.eventSource(self, didSkipRawFile: objectInfo.filename)
                return
            }

            if objectInfo.isJpegFile {
                delegate?.eventSource(
                    self,
                    didDetectPhoto: handle,
                    filename: objectInfo.filename,
                    captureDate: Date(),
                    fileSize: Int(objectInfo.objectCompressedSize)
                )

                let photoData = try await photoOps.downloadPhoto(objectHandle: handle)
                delegate?.eventSource(self, didCompleteDownload: handle, data: photoData)
            }
        } catch {
            delegate?.eventSource(self, didFailWithError: error)
        }
    }

    // MARK: - Network I/O

    private static func sendData(connection: NWConnection, data: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    private static func receiveData(connection: NWConnection, length: Int) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let data = content {
                    continuation.resume(returning: data)
                } else if isComplete {
                    continuation.resume(throwing: NikonEventSourceError.connectionClosed)
                } else {
                    continuation.resume(throwing: NikonEventSourceError.invalidResponse)
                }
            }
        }
    }

    private static func receiveDataAndResponse(
        connection: NWConnection,
        expectedTransactionID: UInt32
    ) async throws -> (data: Data?, response: PTPIPOperationResponse) {
        var accumulatedData = Data()

        while true {
            let headerData = try await receiveData(connection: connection, length: 8)
            guard let header = PTPIPHeader.from(headerData) else {
                throw NikonEventSourceError.invalidResponse
            }

            let payloadLength = Int(header.length) - 8
            let payloadData = payloadLength > 0 ? try await receiveData(connection: connection, length: payloadLength) : Data()

            var fullPacket = headerData
            fullPacket.append(payloadData)

            guard let packetType = PTPIPPacketType(rawValue: header.type) else {
                throw NikonEventSourceError.invalidResponse
            }

            switch packetType {
            case .startDataPacket:
                continue
            case .dataPacket, .endDataPacket:
                if payloadData.count > 4 {
                    accumulatedData.append(payloadData.dropFirst(4))
                }
                continue
            case .operationResponse:
                guard let response = PTPIPOperationResponse.from(fullPacket) else {
                    throw NikonEventSourceError.invalidResponse
                }
                guard response.transactionID == expectedTransactionID else {
                    throw NikonEventSourceError.transactionMismatch
                }
                return (accumulatedData.isEmpty ? nil : accumulatedData, response)
            default:
                throw NikonEventSourceError.invalidResponse
            }
        }
    }
}

enum NikonEventSourceError: LocalizedError {
    case invalidResponse
    case transactionMismatch
    case connectionClosed

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid response from Nikon camera"
        case .transactionMismatch: return "Transaction ID mismatch"
        case .connectionClosed: return "Connection closed"
        }
    }
}
