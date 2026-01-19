//
//  PTPIPSession.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  PTP/IP session lifecycle management
//  Orchestrates command/event channels, event monitoring, and photo downloads
//  Based on libgphoto2's session management pattern
//

import Foundation
import Network
import Combine

// MARK: - Session Delegate

/// Delegate for PTP/IP session notifications
protocol PTPIPSessionDelegate: AnyObject {
    /// Called when session successfully connects
    func sessionDidConnect(_ session: PTPIPSession)

    /// Called when a new photo is detected (ObjectAdded event)
    func session(_ session: PTPIPSession, didDetectPhoto objectHandle: UInt32)

    /// Called when photo download completes
    func session(_ session: PTPIPSession, didDownloadPhoto data: Data, objectHandle: UInt32)

    /// Called when session encounters an error
    func session(_ session: PTPIPSession, didFailWithError error: Error)

    /// Called when session disconnects
    func sessionDidDisconnect(_ session: PTPIPSession)
}

// MARK: - Session Errors

enum PTPIPSessionError: LocalizedError {
    case invalidConfiguration
    case connectionFailed
    case initializationFailed
    case initFailed
    case alreadyConnected
    case notConnected
    case sessionClosed
    case transactionMismatch
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: return "Invalid session configuration"
        case .connectionFailed: return "Failed to connect to camera"
        case .initializationFailed: return "Session initialization failed"
        case .initFailed: return "PTP/IP Init handshake failed"
        case .alreadyConnected: return "Session already connected"
        case .notConnected: return "Session not connected"
        case .sessionClosed: return "Session closed"
        case .transactionMismatch: return "Transaction ID mismatch in response"
        case .invalidResponse: return "Invalid response from camera"
        }
    }
}

// MARK: - PTP/IP Session
// From libgphoto2: Session management with command/event dual channels

/// Manages a PTP/IP session with a WiFi camera
/// Coordinates command channel (control) and event channel (notifications)
/// Implements multi-session support (unlike libgphoto2's single-session)
@MainActor
class PTPIPSession: NSObject {
    weak var delegate: PTPIPSessionDelegate?

    // Connection state
    private var isConnected = false
    private var commandConnection: NWConnection?
    private var eventConnection: NWConnection?

    // Session parameters
    private let sessionID: UInt32
    private var connectionNumber: UInt32 = 0

    // Components
    private var eventMonitor: PTPIPEventMonitor?
    private var photoDownloader: PTPIPPhotoDownloader?
    private var transactionManager: PTPTransactionManager?

    // Configuration
    private let hostName: String
    private let guid: UUID

    /// Initialize session
    /// - Parameters:
    ///   - sessionID: Unique session ID (for multi-session support)
    ///   - hostName: Host name to identify this client
    ///   - guid: Persistent GUID for this client (like libgphoto2)
    init(sessionID: UInt32, hostName: String = "SabaiPics Studio", guid: UUID = UUID()) {
        self.sessionID = sessionID
        self.hostName = hostName
        self.guid = guid

        super.init()

        print("[PTPIPSession] Initialized session \(sessionID)")
    }

    // MARK: - Connection Management

    /// Connect to camera and establish PTP/IP session
    /// Performs complete Init handshake, then opens PTP session
    /// - Parameters:
    ///   - commandConnection: NWConnection to camera port 15740 (command channel)
    ///   - eventConnection: NWConnection to camera port 15740 (event channel)
    func connect(commandConnection: NWConnection, eventConnection: NWConnection) async throws {
        guard !isConnected else {
            throw PTPIPSessionError.alreadyConnected
        }

        print("[PTPIPSession] Connecting session \(sessionID)...")

        self.commandConnection = commandConnection
        self.eventConnection = eventConnection

        // Phase 1: Send Init Command Request on command channel
        print("[PTPIPSession] Sending Init Command Request...")

        let initCmdRequest = PTPIPInitCommandRequest(guid: guid, hostName: hostName)
        let initCmdData = initCmdRequest.toData()

        try await sendData(connection: commandConnection, data: initCmdData)
        print("[PTPIPSession] Init Command Request sent (\(initCmdData.count) bytes)")

        // Receive Init Command Ack
        print("[PTPIPSession] Waiting for Init Command Ack...")

        let ackHeaderData = try await receiveData(connection: commandConnection, length: 8)
        guard let ackHeader = PTPIPHeader.from(ackHeaderData) else {
            throw PTPIPSessionError.initFailed
        }

        guard ackHeader.type == PTPIPPacketType.initCommandAck.rawValue else {
            print("[PTPIPSession] Expected Init Command Ack, got: 0x\(String(format: "%08X", ackHeader.type))")
            throw PTPIPSessionError.initFailed
        }

        // Read payload to get connection number
        let ackPayloadLength = Int(ackHeader.length) - 8
        let ackPayloadData = try await receiveData(connection: commandConnection, length: ackPayloadLength)

        // Connection number is at offset 0 (UInt32)
        guard ackPayloadData.count >= 4 else {
            throw PTPIPSessionError.initFailed
        }
        let connectionNumber = ackPayloadData.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        let connectionNum = UInt32(littleEndian: connectionNumber)

        print("[PTPIPSession] Init Command Ack received, connection number: \(connectionNum)")

        // Phase 2: Send Init Event Request on event channel
        print("[PTPIPSession] Sending Init Event Request...")

        let initEvtRequest = PTPIPInitEventRequest(connectionNumber: connectionNum)
        let initEvtData = initEvtRequest.toData()

        try await sendData(connection: eventConnection, data: initEvtData)
        print("[PTPIPSession] Init Event Request sent (\(initEvtData.count) bytes)")

        // Receive Init Event Ack
        print("[PTPIPSession] Waiting for Init Event Ack...")

        let evtAckHeaderData = try await receiveData(connection: eventConnection, length: 8)
        guard let evtAckHeader = PTPIPHeader.from(evtAckHeaderData) else {
            throw PTPIPSessionError.initFailed
        }

        guard evtAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
            print("[PTPIPSession] Expected Init Event Ack, got: 0x\(String(format: "%08X", evtAckHeader.type))")
            throw PTPIPSessionError.initFailed
        }

        print("[PTPIPSession] Init Event Ack received - handshake complete!")

        // Store connection number
        self.connectionNumber = connectionNum

        // Initialize transaction manager
        self.transactionManager = PTPTransactionManager(sessionID: sessionID)

        // Phase 3: Send OpenSession command (required after Init handshake per libgphoto2)
        try await sendOpenSession()

        // Initialize components
        self.eventMonitor = PTPIPEventMonitor()
        self.photoDownloader = PTPIPPhotoDownloader()

        // Configure downloader
        if let downloader = photoDownloader, let txManager = transactionManager {
            await downloader.configure(connection: commandConnection, transactionManager: txManager)
        }

        // Start event monitoring
        if let monitor = eventMonitor {
            await monitor.setDelegate(self)
            await monitor.startMonitoring(connection: eventConnection)
        }

        isConnected = true
        print("[PTPIPSession] Session \(sessionID) connected")

        delegate?.sessionDidConnect(self)
    }

    /// Disconnect and clean up session
    /// Based on libgphoto2's session teardown pattern
    func disconnect() async {
        guard isConnected else { return }

        print("[PTPIPSession] Disconnecting session \(sessionID)...")

        // Send CloseSession command FIRST (while session is fully active, per libgphoto2)
        do {
            try await sendCloseSession()
            print("[PTPIPSession] CloseSession command sent successfully")
        } catch {
            print("[PTPIPSession] CloseSession command failed: \(error)")
            // Continue with cleanup even if CloseSession fails
        }

        // Stop event monitoring AFTER CloseSession
        if let monitor = eventMonitor {
            await monitor.stopMonitoring()
            await monitor.cleanup()
        }

        // Clean up downloader
        if let downloader = photoDownloader {
            await downloader.cleanup()
        }

        // Clean up connections (don't close, they're managed externally)
        commandConnection = nil
        eventConnection = nil
        eventMonitor = nil
        photoDownloader = nil
        transactionManager = nil

        isConnected = false
        print("[PTPIPSession] Session \(sessionID) disconnected")

        delegate?.sessionDidDisconnect(self)
    }

    // MARK: - Commands

    /// Send OpenSession command
    /// From libgphoto2: PTP_OC_OpenSession (0x1002)
    /// Must be called after Init handshake and before any other commands
    private func sendOpenSession() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        print("[PTPIPSession] Sending OpenSession command...")

        var command = await txManager.createCommand()
        let openCommand = command.openSession()
        let commandData = openCommand.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response
        let response = try await receiveResponse(connection: connection, expectedTransactionID: openCommand.transactionID)

        // Check response code
        guard let responseCode = PTPResponseCode(rawValue: response.responseCode) else {
            print("[PTPIPSession] OpenSession failed with unknown response code: 0x\(String(format: "%04X", response.responseCode))")
            throw PTPIPSessionError.initializationFailed
        }

        guard responseCode.isSuccess else {
            print("[PTPIPSession] OpenSession failed: \(responseCode.errorDescription)")
            throw PTPIPSessionError.initializationFailed
        }

        print("[PTPIPSession] OpenSession succeeded")
    }

    /// Send CloseSession command
    /// From libgphoto2: PTP_OC_CloseSession
    private func sendCloseSession() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        print("[PTPIPSession] Sending CloseSession command...")

        var command = await txManager.createCommand()
        let closeCommand = command.closeSession()
        let commandData = closeCommand.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response (may fail if camera already disconnected)
        do {
            _ = try await receiveResponse(connection: connection, expectedTransactionID: closeCommand.transactionID)
            print("[PTPIPSession] CloseSession succeeded")
        } catch {
            print("[PTPIPSession] CloseSession response failed (camera disconnected?): \(error)")
        }
    }

    /// Download photo by object handle
    /// Delegates to PTPIPPhotoDownloader
    func downloadPhoto(objectHandle: UInt32) async throws -> Data {
        guard isConnected else {
            throw PTPIPSessionError.notConnected
        }

        guard let downloader = photoDownloader else {
            throw PTPIPSessionError.notConnected
        }

        print("[PTPIPSession] Requesting photo download: 0x\(String(format: "%08X", objectHandle))")

        let photoData = try await downloader.downloadPhoto(objectHandle: objectHandle)

        // Notify delegate
        delegate?.session(self, didDownloadPhoto: photoData, objectHandle: objectHandle)

        return photoData
    }

    // MARK: - Helper Methods

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

    /// Receive response packet
    /// From libgphoto2: Handle END_DATA_PACKET before response (retry pattern)
    private func receiveResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> PTPIPOperationResponse {
        // Retry loop to handle END_DATA_PACKET responses
        while true {
            // Read header
            let headerData = try await receiveData(connection: connection, length: 8)
            guard let header = PTPIPHeader.from(headerData) else {
                throw PTPIPSessionError.invalidResponse
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
                throw PTPIPSessionError.invalidResponse
            }

            switch packetType {
            case .endDataPacket:
                // Camera sent END_DATA_PACKET before response - retry
                // From libgphoto2 ptpip.c:398-410 (goto retry pattern)
                print("[PTPIPSession] Received END_DATA_PACKET, retrying for response...")
                continue  // Retry the loop

            case .operationResponse:
                // Got the response we expected
                guard let response = PTPIPOperationResponse.from(fullPacket) else {
                    throw PTPIPSessionError.invalidResponse
                }

                // Validate transaction ID
                guard response.transactionID == expectedTransactionID else {
                    print("[PTPIPSession] Transaction ID mismatch: expected \(expectedTransactionID), got \(response.transactionID)")
                    throw PTPIPSessionError.transactionMismatch
                }

                return response

            default:
                print("[PTPIPSession] Unexpected packet type: 0x\(String(format: "%08X", header.type))")
                throw PTPIPSessionError.invalidResponse
            }
        }
    }

    /// Receive data from connection
    private func receiveData(connection: NWConnection, length: Int) async throws -> Data {
        return try await withCheckedThrowingContinuation { continuation in
            connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                if isComplete {
                    continuation.resume(throwing: PTPIPSessionError.connectionFailed)
                    return
                }

                if let data = content, !data.isEmpty {
                    continuation.resume(returning: data)
                } else {
                    continuation.resume(throwing: PTPIPSessionError.connectionFailed)
                }
            }
        }
    }

    // MARK: - Public Properties

    /// Current session ID
    var currentSessionID: UInt32 {
        return sessionID
    }

    /// Is session currently connected
    var connected: Bool {
        return isConnected
    }
}

// MARK: - Event Monitor Delegate

extension PTPIPSession: PTPIPEventMonitorDelegate {
    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didReceiveObjectAdded objectHandle: UInt32) {
        Task { @MainActor in
            do {
                print("[PTPIPSession] ObjectAdded event: 0x\(String(format: "%08X", objectHandle))")
                delegate?.session(self, didDetectPhoto: objectHandle)

                // Auto-download photo when detected
                do {
                    let photoData = try await downloadPhoto(objectHandle: objectHandle)
                    print("[PTPIPSession] Auto-downloaded photo: \(photoData.count) bytes")
                } catch {
                    print("[PTPIPSession] Auto-download failed: \(error)")
                    delegate?.session(self, didFailWithError: error)
                }
            } catch {
                print("[PTPIPSession] Delegate error in didReceiveObjectAdded: \(error)")
            }
        }
    }

    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error) {
        Task { @MainActor in
            do {
                print("[PTPIPSession] Event monitor error: \(error)")
                delegate?.session(self, didFailWithError: error)
            } catch {
                print("[PTPIPSession] Delegate error in didFailWithError: \(error)")
            }
        }
    }

    nonisolated func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor) {
        Task { @MainActor in
            do {
                print("[PTPIPSession] Event monitor disconnected")
                await disconnect()
            } catch {
                print("[PTPIPSession] Delegate error in didDisconnect: \(error)")
            }
        }
    }
}
