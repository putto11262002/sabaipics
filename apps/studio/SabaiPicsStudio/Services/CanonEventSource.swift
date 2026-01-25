//
//  CanonEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-20
//  Canon EOS event polling implementation
//  Extracted from PTPIPSession.swift - no behavior changes
//
//  Canon cameras don't send events on the event channel - they require polling
//  with the Canon_EOS_GetEvent command (0x9116)
//

import Foundation
import Network

// MARK: - Photo Operations Protocol

/// Protocol for photo operations needed by event sources
/// Implemented by PTPIPSession to provide download capability
@MainActor
protocol PhotoOperationsProvider: AnyObject {
    func getObjectInfo(objectHandle: UInt32) async throws -> PTPObjectInfo
    func downloadPhoto(objectHandle: UInt32) async throws -> Data
}

// MARK: - Canon Event Source

/// Canon EOS event polling implementation
/// Uses Canon_EOS_GetEvent (0x9116) with adaptive 50-200ms polling
/// Based on libgphoto2's Canon EOS event handling
@MainActor
class CanonEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    // Dependencies
    private weak var commandConnection: NWConnection?
    private weak var transactionManager: PTPTransactionManager?
    private weak var photoOps: PhotoOperationsProvider?

    // Polling state
    private var pollingTask: Task<Void, Never>?
    private var isMonitoring = false

    // Adaptive polling intervals (libgphoto2 pattern)
    private var pollInterval: TimeInterval = 0.05  // Start at 50ms
    private let minPollInterval: TimeInterval = 0.05   // 50ms minimum
    private let maxPollInterval: TimeInterval = 0.2    // 200ms maximum

    /// Initialize Canon event source
    /// - Parameters:
    ///   - commandConnection: Command channel connection
    ///   - transactionManager: Transaction manager for creating commands
    ///   - photoOps: Provider for photo operations (getObjectInfo, downloadPhoto)
    init(
        commandConnection: NWConnection?,
        transactionManager: PTPTransactionManager?,
        photoOps: PhotoOperationsProvider?
    ) {
        self.commandConnection = commandConnection
        self.transactionManager = transactionManager
        self.photoOps = photoOps
    }

    // MARK: - CameraEventSource Protocol

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

        // Cancel connection FIRST to interrupt pending send/receive operations
        // This prevents hanging on network calls during disconnect
        commandConnection?.cancel()

        pollingTask?.cancel()
        // Wait for polling task to actually complete before returning
        // This prevents race conditions where resources are cleaned up
        // while the polling loop is still executing
        await pollingTask?.value
        pollingTask = nil
    }

    func cleanup() async {
        await stopMonitoring()
        commandConnection = nil
        transactionManager = nil
        photoOps = nil
    }

    // MARK: - Canon Initialization

    /// Initialize Canon EOS for event reporting
    /// From libgphoto2 config.c: SetEventMode(1) enables event reporting
    /// Without SetEventMode(1), GetEvent always returns empty (8-byte terminator)
    /// NOTE: We intentionally skip SetRemoteMode to avoid taking over camera control
    func initializeCanonEOS() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw CanonEventSourceError.notConnected
        }

        // SetEventMode(1) - Enable event reporting (CRITICAL!)
        // NOTE: We skip SetRemoteMode because we only want to monitor events
        var command = await txManager.createCommand()
        let setEventModeCmd = command.canonSetEventMode(mode: 1)
        let eventModeData = setEventModeCmd.toData()

        try await sendData(connection: connection, data: eventModeData)
        let eventModeResponse = try await receiveResponse(connection: connection, expectedTransactionID: setEventModeCmd.transactionID)

        if let responseCode = PTPResponseCode(rawValue: eventModeResponse.responseCode), !responseCode.isSuccess {
            print("[CanonEventSource] WARNING: SetEventMode failed - events may not work")
        }

        // Flush initial event queue (per libgphoto2 ptp_check_eos_events)
        do {
            var command2 = await txManager.createCommand()
            let getEventCmd = command2.canonGetEvent()
            let getEventData = getEventCmd.toData()

            try await sendData(connection: connection, data: getEventData)
            _ = try await receiveCanonEventResponse(connection: connection, expectedTransactionID: getEventCmd.transactionID)
        } catch {
            // Non-fatal - initial flush can fail
        }
    }

    // MARK: - Polling Loop

    /// Canon EOS polling loop with adaptive backoff (libgphoto2 pattern)
    /// - Polls Canon_EOS_GetEvent with 50-200ms adaptive interval
    /// - When events found: poll immediately (reset to 50ms)
    /// - When no events: sleep and increase interval (up to 200ms max)
    private func pollingLoop() async {
        print("[CanonEventSource] Canon adaptive polling started (50-200ms)")

        // Reset poll interval at start
        pollInterval = minPollInterval

        while isMonitoring {
            do {
                // Poll Canon GetEvent
                let foundEvents = try await pollCanonEvent()

                if foundEvents {
                    // Events found - reset backoff and poll again immediately
                    pollInterval = minPollInterval
                    print("[CanonEventSource] Events found, polling immediately")
                    continue  // No sleep - immediate next poll
                } else {
                    // No events - adaptive backoff
                    print("[CanonEventSource] No events, sleeping \(Int(pollInterval * 1000))ms")
                    try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))

                    // Increase interval for next poll (up to max)
                    let newInterval = min(pollInterval + 0.05, maxPollInterval)
                    if newInterval > pollInterval {
                        pollInterval = newInterval
                        print("[CanonEventSource] Poll interval increased to \(Int(pollInterval * 1000))ms")
                    }
                }

            } catch is CancellationError {
                break
            } catch {
                // Error - back off with max interval and retry
                print("[CanonEventSource] Poll error: \(error), backing off \(Int(maxPollInterval * 1000))ms")
                try? await Task.sleep(nanoseconds: UInt64(maxPollInterval * 1_000_000_000))
            }
        }

        print("[CanonEventSource] Canon polling stopped")
    }

    /// Poll Canon EOS GetEvent
    /// Sends Canon_EOS_GetEvent command and processes response
    /// Filters out RAW files and only downloads JPEGs
    /// - Returns: true if events were found (photos detected), false if empty
    private func pollCanonEvent() async throws -> Bool {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            return false
        }

        // Create Canon GetEvent command
        var command = await txManager.createCommand()
        let getEventCommand = command.canonGetEvent()
        let commandData = getEventCommand.toData()

        // Send command with cancellation support
        try await withTaskCancellationHandler {
            try await sendData(connection: connection, data: commandData)
        } onCancel: {
            connection.cancel()
        }

        // Read response (may contain data packets with events) with cancellation support
        let response = try await withTaskCancellationHandler {
            try await receiveCanonEventResponse(connection: connection, expectedTransactionID: getEventCommand.transactionID)
        } onCancel: {
            connection.cancel()
        }

        // Parse events from response data
        guard let eventData = response.data, !eventData.isEmpty else {
            return false  // No event data
        }

        let photosToDownload = parseCanonEvents(eventData)

        if photosToDownload.isEmpty {
            return false  // No photos in events
        }

        // Download photos SEQUENTIALLY (PTP/IP commands must be serialized)
        // Filter out RAW files - only download JPEGs
        for handle in photosToDownload {
            await processPhotoHandle(handle)
        }

        return true  // Events were found and processed
    }

    /// Process a single photo handle - get info, filter, download
    private func processPhotoHandle(_ handle: UInt32) async {
        guard let photoOps = photoOps else { return }

        // Get object info to check file type
        do {
            let objectInfo = try await photoOps.getObjectInfo(objectHandle: handle)

            // Skip RAW files
            if objectInfo.isRawFile {
                print("[CanonEventSource] Skipping RAW file: \(objectInfo.filename) (format: 0x\(String(format: "%04X", objectInfo.objectFormat)))")
                delegate?.eventSource(self, didSkipRawFile: objectInfo.filename)
                return
            }

            // Only download JPEG files
            if objectInfo.isJpegFile {
                print("[CanonEventSource] 📷 Downloading JPEG: \(objectInfo.filename)")
                delegate?.eventSource(self, didDetectPhoto: handle)
                let photoData = try await photoOps.downloadPhoto(objectHandle: handle)
                print("[CanonEventSource] Photo 0x\(String(format: "%08X", handle)) downloaded (\(photoData.count) bytes)")
            } else {
                // Unknown format - log and skip
                print("[CanonEventSource] ⏭️ Skipping unknown format: \(objectInfo.filename) (format: 0x\(String(format: "%04X", objectInfo.objectFormat)))")
            }
        } catch {
            print("[CanonEventSource] Failed to get object info for 0x\(String(format: "%08X", handle)): \(error)")
            // Fall back to downloading anyway if we can't determine the type
            delegate?.eventSource(self, didDetectPhoto: handle)
            do {
                let photoData = try await photoOps.downloadPhoto(objectHandle: handle)
                print("[CanonEventSource] Photo 0x\(String(format: "%08X", handle)) downloaded (\(photoData.count) bytes)")
            } catch {
                print("[CanonEventSource] Photo download failed: \(error)")
                delegate?.eventSource(self, didFailWithError: error)
            }
        }
    }

    // MARK: - Canon Event Parsing

    /// Parse Canon event data for ObjectAdded events
    /// Canon returns a packed structure with multiple events
    /// Based on libgphoto2 ptp-pack.c ptp_unpack_CANON_changes()
    /// Returns list of object handles to download
    private func parseCanonEvents(_ data: Data) -> [UInt32] {
        var offset = 0
        var photosToDownload: [UInt32] = []

        // From libgphoto2: while (curdata - data + 8 < datasize)
        while offset + 8 < data.count {
            // Canon event format: size (4 bytes) + type (4 bytes) + data...
            let size = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
            let eventSize = Int(UInt32(littleEndian: size))

            let eventType = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset + 4, as: UInt32.self) }
            let type = UInt32(littleEndian: eventType)

            // Terminator check: size=8, type=0 means end of events
            if eventSize == 8 && type == 0 {
                break
            }

            if eventSize < 8 || offset + eventSize >= data.count {
                break
            }

            // Check for photo-related events (from libgphoto2 ptp-pack.c)
            // 0xC181 = ObjectAddedEx, 0xC1A7 = ObjectAddedEx64
            // 0xC186 = RequestObjectTransfer, 0xC1A9 = RequestObjectTransfer64
            switch type {
            case 0xC181, 0xC1A7, 0xC186, 0xC1A9:
                if eventSize >= 12 {
                    let objectHandle = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset + 8, as: UInt32.self) }
                    let handle = UInt32(littleEndian: objectHandle)
                    print("[CanonEventSource] Photo detected: 0x\(String(format: "%08X", handle))")
                    photosToDownload.append(handle)
                }

            default:
                break
            }

            offset += eventSize
        }

        return photosToDownload
    }

    // MARK: - Network I/O (copied from PTPIPSession for self-contained operation)

    /// Receive Canon GetEvent response (handles data packets + response)
    private func receiveCanonEventResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> (data: Data?, response: PTPIPOperationResponse) {
        var accumulatedData = Data()

        // Read packets until we get OperationResponse
        while true {
            // Read header
            let headerData = try await receiveData(connection: connection, length: 8)
            guard let header = PTPIPHeader.from(headerData) else {
                throw CanonEventSourceError.invalidResponse
            }

            // Read payload
            let payloadLength = Int(header.length) - 8
            let payloadData: Data
            if payloadLength > 0 {
                payloadData = try await receiveData(connection: connection, length: payloadLength)
            } else {
                payloadData = Data()
            }

            var fullPacket = headerData
            fullPacket.append(payloadData)

            // Handle packet type
            guard let packetType = PTPIPPacketType(rawValue: header.type) else {
                throw CanonEventSourceError.invalidResponse
            }

            switch packetType {
            case .startDataPacket:
                // START_DATA_PACKET: TransID(4) + TotalLength(8), NO actual data
                continue

            case .dataPacket:
                // DATA_PACKET: Skip 4 bytes (transID), data at offset 4
                if payloadData.count > 4 {
                    accumulatedData.append(payloadData.dropFirst(4))
                }
                continue

            case .endDataPacket:
                // END_DATA_PACKET: Same as DATA_PACKET
                if payloadData.count > 4 {
                    accumulatedData.append(payloadData.dropFirst(4))
                }
                continue

            case .operationResponse:
                // Got response - parse and return
                guard let response = PTPIPOperationResponse.from(fullPacket) else {
                    throw CanonEventSourceError.invalidResponse
                }

                // Validate transaction ID
                guard response.transactionID == expectedTransactionID else {
                    throw CanonEventSourceError.transactionMismatch
                }

                return (accumulatedData.isEmpty ? nil : accumulatedData, response)

            default:
                throw CanonEventSourceError.invalidResponse
            }
        }
    }

    /// Send data on connection
    private func sendData(connection: NWConnection, data: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    /// Receive exact number of bytes from connection
    private func receiveData(connection: NWConnection, length: Int) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let data = content {
                    continuation.resume(returning: data)
                } else if isComplete {
                    continuation.resume(throwing: CanonEventSourceError.connectionClosed)
                } else {
                    continuation.resume(throwing: CanonEventSourceError.invalidResponse)
                }
            }
        }
    }

    /// Receive PTP operation response
    private func receiveResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> PTPIPOperationResponse {
        // Read header (8 bytes)
        let headerData = try await receiveData(connection: connection, length: 8)
        guard let header = PTPIPHeader.from(headerData) else {
            throw CanonEventSourceError.invalidResponse
        }

        // Read payload
        let payloadLength = Int(header.length) - 8
        let payloadData: Data
        if payloadLength > 0 {
            payloadData = try await receiveData(connection: connection, length: payloadLength)
        } else {
            payloadData = Data()
        }

        var fullPacket = headerData
        fullPacket.append(payloadData)

        // Parse response
        guard let response = PTPIPOperationResponse.from(fullPacket) else {
            throw CanonEventSourceError.invalidResponse
        }

        // Validate transaction ID
        guard response.transactionID == expectedTransactionID else {
            throw CanonEventSourceError.transactionMismatch
        }

        return response
    }
}

// MARK: - Errors

enum CanonEventSourceError: LocalizedError {
    case notConnected
    case invalidResponse
    case transactionMismatch
    case connectionClosed

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Canon event source not connected"
        case .invalidResponse: return "Invalid response from Canon camera"
        case .transactionMismatch: return "Transaction ID mismatch"
        case .connectionClosed: return "Connection closed"
        }
    }
}
