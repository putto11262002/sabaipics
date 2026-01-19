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

// MARK: - Camera Vendor

/// Camera vendor types (based on PTP/IP behavior)
enum CameraVendor {
    case canon      // Canon EOS - requires polling
    case nikon      // Nikon - requires polling
    case standard   // Sony, Fuji, Olympus, etc - uses event channel
    case unknown    // Not yet detected
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
    private var canonPollingTask: Task<Void, Never>?

    // Camera detection
    private var cameraVendor: CameraVendor = .unknown

    // Configuration
    private let hostName: String
    private let guid: UUID

    /// Initialize session
    /// - Parameters:
    ///   - sessionID: Unique session ID (for multi-session support)
    ///   - hostName: Host name to identify this client
    ///   - guid: Persistent GUID for this client (like libgphoto2)
    init(sessionID: UInt32, hostName: String = "sabaipics-studio", guid: UUID = UUID()) {
        self.sessionID = sessionID
        self.hostName = hostName
        self.guid = guid

        super.init()
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

        print("[PTPIPSession] Connecting...")

        self.commandConnection = commandConnection
        self.eventConnection = eventConnection

        // Phase 1: Send Init Command Request on command channel
        let initCmdRequest = PTPIPInitCommandRequest(guid: guid, hostName: hostName)
        let initCmdData = initCmdRequest.toData()

        try await sendData(connection: commandConnection, data: initCmdData)

        // Receive Init Command Ack
        let ackHeaderData = try await receiveData(connection: commandConnection, length: 8)
        guard let ackHeader = PTPIPHeader.from(ackHeaderData) else {
            throw PTPIPSessionError.initFailed
        }

        // Check if we got Init Command Ack or Init Fail
        if ackHeader.type == PTPIPPacketType.initFail.rawValue {
            // Camera rejected our Init Command Request
            let failPayloadLength = Int(ackHeader.length) - 8
            if failPayloadLength >= 4 {
                _ = try await receiveData(connection: commandConnection, length: failPayloadLength)
            }
            print("[PTPIPSession] Init failed - camera rejected connection")
            throw PTPIPSessionError.initFailed
        }

        guard ackHeader.type == PTPIPPacketType.initCommandAck.rawValue else {
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

        // Parse camera name (offset 20+, UCS-2 string)
        if ackPayloadData.count >= 20 {
            let cameraNameData = ackPayloadData.dropFirst(20)
            if let cameraName = String(data: cameraNameData, encoding: .utf16LittleEndian) {
                print("[PTPIPSession] Connected to: \(cameraName)")
                cameraVendor = detectCameraVendor(from: cameraName)
            }
        }

        // Now start event connection (per libgphoto2: connect event AFTER Init Command Ack)
        eventConnection.start(queue: .main)

        // Wait for event connection to be ready
        try await waitForEventConnection(eventConnection, timeout: 5.0)

        // Phase 2: Send Init Event Request on event channel
        let initEvtRequest = PTPIPInitEventRequest(connectionNumber: connectionNum)
        let initEvtData = initEvtRequest.toData()

        try await sendData(connection: eventConnection, data: initEvtData)

        // Receive Init Event Ack
        let evtAckHeaderData = try await receiveData(connection: eventConnection, length: 8)
        guard let evtAckHeader = PTPIPHeader.from(evtAckHeaderData) else {
            throw PTPIPSessionError.initFailed
        }

        guard evtAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
            throw PTPIPSessionError.initFailed
        }

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

        // Start appropriate event handling based on camera vendor
        switch cameraVendor {
        case .canon:
            // Initialize Canon EOS before starting polling
            // Per libgphoto2: SetEventMode(1) MUST be called after OpenSession
            try await initializeCanonEOS()
            startCanonPolling()

        case .nikon:
            startNikonPolling()

        case .standard, .unknown:
            if let monitor = eventMonitor {
                await monitor.setDelegate(self)
                await monitor.startMonitoring(connection: eventConnection)
            }
        }

        isConnected = true
        print("[PTPIPSession] Session ready")

        delegate?.sessionDidConnect(self)
    }

    /// Disconnect and clean up session
    /// Based on libgphoto2's session teardown pattern
    func disconnect() async {
        guard isConnected else { return }

        print("[PTPIPSession] Disconnecting...")

        // Send CloseSession command FIRST (while session is fully active, per libgphoto2)
        do {
            try await sendCloseSession()
        } catch {
            // Continue with cleanup even if CloseSession fails
        }

        // Stop event monitoring AFTER CloseSession
        if let monitor = eventMonitor {
            await monitor.stopMonitoring()
            await monitor.cleanup()
        }

        // Stop Canon polling
        canonPollingTask?.cancel()
        canonPollingTask = nil

        // Clean up downloader
        if let downloader = photoDownloader {
            await downloader.cleanup()
        }

        // Cancel TCP connections to properly close sockets
        commandConnection?.cancel()
        eventConnection?.cancel()

        // Clean up connections
        commandConnection = nil
        eventConnection = nil
        eventMonitor = nil
        photoDownloader = nil
        transactionManager = nil

        isConnected = false
        print("[PTPIPSession] Disconnected")

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

        var command = await txManager.createCommand()
        let openCommand = command.openSession()
        let commandData = openCommand.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response
        let response = try await receiveResponse(connection: connection, expectedTransactionID: openCommand.transactionID)

        // Check response code
        guard let responseCode = PTPResponseCode(rawValue: response.responseCode),
              responseCode.isSuccess else {
            throw PTPIPSessionError.initializationFailed
        }
    }

    /// Send CloseSession command
    /// From libgphoto2: PTP_OC_CloseSession
    private func sendCloseSession() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()
        let closeCommand = command.closeSession()
        let commandData = closeCommand.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response (may fail if camera already disconnected)
        _ = try? await receiveResponse(connection: connection, expectedTransactionID: closeCommand.transactionID)
    }

    /// Initialize Canon EOS for event reporting
    /// From libgphoto2 config.c: SetEventMode(1) enables event reporting
    /// Without SetEventMode(1), GetEvent always returns empty (8-byte terminator)
    /// NOTE: We intentionally skip SetRemoteMode to avoid taking over camera control
    private func initializeCanonEOS() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        // SetEventMode(1) - Enable event reporting (CRITICAL!)
        // NOTE: We skip SetRemoteMode because we only want to monitor events
        var command = await txManager.createCommand()
        let setEventModeCmd = command.canonSetEventMode(mode: 1)
        let eventModeData = setEventModeCmd.toData()

        try await sendData(connection: connection, data: eventModeData)
        let eventModeResponse = try await receiveResponse(connection: connection, expectedTransactionID: setEventModeCmd.transactionID)

        if let responseCode = PTPResponseCode(rawValue: eventModeResponse.responseCode), !responseCode.isSuccess {
            print("[PTPIPSession] WARNING: SetEventMode failed - events may not work")
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

    /// Download photo by object handle
    /// Delegates to PTPIPPhotoDownloader
    func downloadPhoto(objectHandle: UInt32) async throws -> Data {
        guard isConnected else {
            throw PTPIPSessionError.notConnected
        }

        guard let downloader = photoDownloader else {
            throw PTPIPSessionError.notConnected
        }

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
                continue  // Retry the loop

            case .operationResponse:
                // Got the response we expected
                guard let response = PTPIPOperationResponse.from(fullPacket) else {
                    throw PTPIPSessionError.invalidResponse
                }

                // Validate transaction ID
                guard response.transactionID == expectedTransactionID else {
                    throw PTPIPSessionError.transactionMismatch
                }

                return response

            default:
                throw PTPIPSessionError.invalidResponse
            }
        }
    }

    /// Wait for event connection to reach ready state
    private func waitForEventConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var resumed = false

            // Timeout task
            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard !resumed else { return }
                resumed = true
                continuation.resume(throwing: PTPIPSessionError.connectionFailed)
            }

            connection.stateUpdateHandler = { state in
                guard !resumed else { return }
                switch state {
                case .ready:
                    resumed = true
                    timeoutTask.cancel()
                    continuation.resume()
                case .failed(let error):
                    resumed = true
                    timeoutTask.cancel()
                    continuation.resume(throwing: error)
                default:
                    break
                }
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

    // MARK: - Camera Vendor Detection

    /// Detect camera vendor from camera name
    /// Based on libgphoto2's vendor detection logic
    private func detectCameraVendor(from cameraName: String) -> CameraVendor {
        let name = cameraName.lowercased()

        // Canon detection
        if name.contains("canon") || name.contains("eos") {
            return .canon
        }

        // Nikon detection
        if name.contains("nikon") {
            return .nikon
        }

        // Sony, Fuji, Olympus, Panasonic use standard PTP
        if name.contains("sony") || name.contains("fuji") ||
           name.contains("olympus") || name.contains("panasonic") {
            return .standard
        }

        // Default to standard PTP for unknown vendors
        return .standard
    }

    // MARK: - Nikon Polling
    // Nikon cameras also require polling (future implementation)

    /// Start Nikon event polling
    /// TODO: Implement Nikon_GetEvent polling
    private func startNikonPolling() {
        // For now, try event channel
        if let monitor = eventMonitor, let connection = eventConnection {
            Task {
                await monitor.setDelegate(self)
                await monitor.startMonitoring(connection: connection)
            }
        }
    }

    // MARK: - Canon EOS Polling
    // Canon EOS cameras don't send events on event channel - they require polling

    /// Start Canon EOS event polling
    /// Canon cameras require active polling with Canon_EOS_GetEvent command
    private func startCanonPolling() {
        canonPollingTask = Task { [weak self] in
            await self?.canonPollingLoop()
        }
    }

    /// Canon EOS polling loop
    /// Polls Canon_EOS_GetEvent every 2 seconds
    private func canonPollingLoop() async {
        while isConnected {
            do {
                // Poll Canon GetEvent
                try await pollCanonEvent()

                // Wait 2 seconds before next poll (like libgphoto2)
                try await Task.sleep(nanoseconds: 2_000_000_000)

            } catch is CancellationError {
                break
            } catch {
                // Continue polling even on error
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    /// Poll Canon EOS GetEvent
    /// Sends Canon_EOS_GetEvent command and processes response
    private func pollCanonEvent() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            return
        }

        // Create Canon GetEvent command
        var command = await txManager.createCommand()
        let getEventCommand = command.canonGetEvent()
        let commandData = getEventCommand.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response (may contain data packets with events)
        let response = try await receiveCanonEventResponse(connection: connection, expectedTransactionID: getEventCommand.transactionID)

        // Parse events from response data
        if let eventData = response.data, !eventData.isEmpty {
            let photosToDownload = parseCanonEvents(eventData)

            // Download photos SEQUENTIALLY (PTP/IP commands must be serialized)
            for handle in photosToDownload {
                delegate?.session(self, didDetectPhoto: handle)
                do {
                    let photoData = try await downloadPhoto(objectHandle: handle)
                    print("[PTPIPSession] Photo 0x\(String(format: "%08X", handle)) downloaded (\(photoData.count) bytes)")
                } catch {
                    print("[PTPIPSession] Photo download failed: \(error)")
                    delegate?.session(self, didFailWithError: error)
                }
            }
        }
    }

    /// Receive Canon GetEvent response (handles data packets + response)
    private func receiveCanonEventResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> (data: Data?, response: PTPIPOperationResponse) {
        var accumulatedData = Data()

        // Read packets until we get OperationResponse
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
                    throw PTPIPSessionError.invalidResponse
                }

                // Validate transaction ID
                guard response.transactionID == expectedTransactionID else {
                    throw PTPIPSessionError.transactionMismatch
                }

                return (accumulatedData.isEmpty ? nil : accumulatedData, response)

            default:
                throw PTPIPSessionError.invalidResponse
            }
        }
    }

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
                    print("[PTPIPSession] Photo detected: 0x\(String(format: "%08X", handle))")
                    photosToDownload.append(handle)
                }

            default:
                break
            }

            offset += eventSize
        }

        return photosToDownload
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
            print("[PTPIPSession] Photo detected: 0x\(String(format: "%08X", objectHandle))")
            delegate?.session(self, didDetectPhoto: objectHandle)

            // Auto-download photo when detected
            do {
                let photoData = try await downloadPhoto(objectHandle: objectHandle)
                print("[PTPIPSession] Photo 0x\(String(format: "%08X", objectHandle)) downloaded (\(photoData.count) bytes)")
            } catch {
                print("[PTPIPSession] Photo download failed: \(error)")
                delegate?.session(self, didFailWithError: error)
            }
        }
    }

    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error) {
        Task { @MainActor in
            delegate?.session(self, didFailWithError: error)
        }
    }

    nonisolated func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor) {
        Task { @MainActor in
            await disconnect()
        }
    }
}
