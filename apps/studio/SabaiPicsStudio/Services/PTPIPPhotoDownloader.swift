//
//  PTPIPPhotoDownloader.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  Photo download via PTP/IP GetObject command
//  Based on libgphoto2's chunked data transfer pattern
//

import Foundation
import Network
import os.lock

// MARK: - Photo Downloader Errors

enum PTPIPPhotoDownloaderError: LocalizedError {
    case notConnected
    case invalidResponse
    case invalidDataPacket
    case downloadFailed(PTPResponseCode)
    case timeout
    case dataMismatch(expected: UInt32, received: Int)
    case transactionMismatch

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Downloader not connected"
        case .invalidResponse: return "Invalid response from camera"
        case .invalidDataPacket: return "Invalid data packet"
        case .downloadFailed(let code): return "Download failed: \(code.errorDescription)"
        case .timeout: return "Download timeout"
        case .dataMismatch(let expected, let received):
            return "Data size mismatch: expected \(expected), received \(received)"
        case .transactionMismatch: return "Transaction ID mismatch"
        }
    }
}

// MARK: - Photo Downloader
// From libgphoto2: GetObject command with chunked data reassembly

/// Downloads photos from PTP/IP cameras using GetObject command
/// Handles chunked data transfer and reassembly (libgphoto2 pattern)
actor PTPIPPhotoDownloader {
    private var commandConnection: NWConnection?
    private var transactionManager: PTPTransactionManager?

    private let commandTimeout: TimeInterval = 60.0  // 60s for large photo downloads

    /// Initialize downloader
    init() {
    }

    /// Configure downloader with command connection
    /// - Parameters:
    ///   - connection: Active NWConnection for command channel
    ///   - transactionManager: Transaction ID manager
    func configure(connection: NWConnection, transactionManager: PTPTransactionManager) async {
        self.commandConnection = connection
        self.transactionManager = transactionManager
    }

    /// Download photo by object handle
    /// Based on libgphoto2's ptp_getobject pattern
    /// - Parameter objectHandle: PTP object handle
    /// - Returns: Photo data
    func downloadPhoto(objectHandle: UInt32) async throws -> Data {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPPhotoDownloaderError.notConnected
        }

        PTPLogger.info("Downloading object \(PTPLogger.formatHex(objectHandle))", category: PTPLogger.command)

        // Build GetObject command
        var command = await txManager.createCommand()
        let getObjectCommand = command.getObject(handle: objectHandle)
        let expectedTransactionID = getObjectCommand.transactionID

        let startTime = Date()

        // Send command
        let commandData = getObjectCommand.toData()
        try await sendData(connection: connection, data: commandData)

        // Receive data packets
        let photoData = try await receiveDataPackets(connection: connection)

        // Receive operation response with transaction ID validation
        let response = try await receiveResponse(connection: connection, expectedTransactionID: expectedTransactionID)
        guard let responseCode = PTPResponseCode(rawValue: response.responseCode),
              responseCode.isSuccess else {
            PTPLogger.error("Download failed: \(PTPResponseCode(rawValue: response.responseCode)?.name ?? "Unknown")", category: PTPLogger.command)
            throw PTPIPPhotoDownloaderError.downloadFailed(
                PTPResponseCode(rawValue: response.responseCode) ?? .generalError
            )
        }

        let duration = Date().timeIntervalSince(startTime)
        let throughput = PTPLogger.formatThroughput(bytes: photoData.count, duration: duration)

        PTPLogger.info("Download complete: \(PTPLogger.formatSize(photoData.count)) in \(PTPLogger.formatDuration(duration)) (\(throughput))", category: PTPLogger.command)

        return photoData
    }

    /// Receive data packets and reassemble
    /// Based on libgphoto2's chunked data transfer pattern:
    /// PTPIP_START_DATA_PACKET -> multiple PTPIP_DATA_PACKET -> PTPIP_END_DATA_PACKET
    private func receiveDataPackets(connection: NWConnection) async throws -> Data {
        var accumulatedData = Data()
        var expectedTotalLength: UInt32 = 0
        var receivedStartPacket = false

        while true {
            // Read packet header
            let headerData = try await receiveWithTimeout(connection: connection, minimumLength: 8, maximumLength: 8)
            guard let header = PTPIPHeader.from(headerData) else {
                throw PTPIPPhotoDownloaderError.invalidDataPacket
            }

            let packetType = PTPIPPacketType(rawValue: header.type)

            switch packetType {
            case .startDataPacket:
                // First packet: contains total data length
                let payloadLength = Int(header.length) - 8
                let payloadData = try await receiveWithTimeout(connection: connection, minimumLength: payloadLength, maximumLength: payloadLength)

                var fullPacket = headerData
                fullPacket.append(payloadData)

                guard let startPacket = PTPIPStartDataPacket.from(fullPacket) else {
                    throw PTPIPPhotoDownloaderError.invalidDataPacket
                }

                expectedTotalLength = startPacket.totalDataLength
                receivedStartPacket = true

                PTPLogger.debug("Start data packet: expecting \(PTPLogger.formatSize(Int(expectedTotalLength)))", category: PTPLogger.command)

            case .dataPacket:
                // Intermediate data packets
                let payloadLength = Int(header.length) - 8
                let payloadData = try await receiveWithTimeout(connection: connection, minimumLength: payloadLength, maximumLength: payloadLength)

                var fullPacket = headerData
                fullPacket.append(payloadData)

                guard let dataPacket = PTPIPDataPacket.from(fullPacket) else {
                    throw PTPIPPhotoDownloaderError.invalidDataPacket
                }

                accumulatedData.append(dataPacket.data)

                if receivedStartPacket {
                    let progress = Double(accumulatedData.count) / Double(expectedTotalLength) * 100.0
                    PTPLogger.debug("Download progress: \(accumulatedData.count)/\(expectedTotalLength) bytes (\(String(format: "%.1f", progress))%)", category: PTPLogger.command)
                }

            case .endDataPacket:
                // Last packet: marks end of transfer and may contain final data chunk
                let payloadLength = Int(header.length) - 8
                let payloadData = try await receiveWithTimeout(connection: connection, minimumLength: payloadLength, maximumLength: payloadLength)

                var fullPacket = headerData
                fullPacket.append(payloadData)

                // Parse EndDataPacket structure
                guard let endPacket = PTPIPDataPacket.from(fullPacket) else {
                    throw PTPIPPhotoDownloaderError.invalidDataPacket
                }

                // Extract any remaining data from EndDataPacket (critical for small photos < 64KB)
                if !endPacket.data.isEmpty {
                    accumulatedData.append(endPacket.data)
                }

                // Verify data length matches expectation (like libgphoto2)
                if receivedStartPacket && UInt32(accumulatedData.count) != expectedTotalLength {
                    throw PTPIPPhotoDownloaderError.dataMismatch(
                        expected: expectedTotalLength,
                        received: accumulatedData.count
                    )
                }

                return accumulatedData

            default:
                throw PTPIPPhotoDownloaderError.invalidDataPacket
            }
        }
    }

    /// Receive operation response packet
    /// Based on libgphoto2's response parsing
    private func receiveResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> PTPIPOperationResponse {
        // Read header
        let headerData = try await receiveWithTimeout(connection: connection, minimumLength: 8, maximumLength: 8)
        guard let header = PTPIPHeader.from(headerData) else {
            throw PTPIPPhotoDownloaderError.invalidResponse
        }

        // Read payload
        let payloadLength = Int(header.length) - 8
        let payloadData = try await receiveWithTimeout(connection: connection, minimumLength: payloadLength, maximumLength: payloadLength)

        var fullPacket = headerData
        fullPacket.append(payloadData)

        guard let response = PTPIPOperationResponse.from(fullPacket) else {
            throw PTPIPPhotoDownloaderError.invalidResponse
        }

        // Validate transaction ID matches request
        guard response.transactionID == expectedTransactionID else {
            throw PTPIPPhotoDownloaderError.transactionMismatch
        }

        return response
    }

    /// Send data to connection
    private func sendData(connection: NWConnection, data: Data) async throws {
        return try await withCheckedThrowingContinuation { continuation in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    /// Receive data with timeout
    /// Based on libgphoto2's ptpip_read_with_timeout
    /// Fixed: Uses OSAllocatedUnfairLock to prevent race condition in continuation resume
    private func receiveWithTimeout(connection: NWConnection, minimumLength: Int, maximumLength: Int) async throws -> Data {
        return try await withCheckedThrowingContinuation { continuation in
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            // Timeout task
            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(commandTimeout * 1_000_000_000))

                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    continuation.resume(throwing: PTPIPPhotoDownloaderError.timeout)
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
                        resumeResult = .failure(PTPIPPhotoDownloaderError.notConnected)
                    } else if let data = content, !data.isEmpty {
                        resumeResult = .success(data)
                    } else {
                        resumeResult = .failure(PTPIPPhotoDownloaderError.invalidDataPacket)
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

    /// Clean up resources
    func cleanup() async {
        commandConnection = nil
        transactionManager = nil
    }
}
