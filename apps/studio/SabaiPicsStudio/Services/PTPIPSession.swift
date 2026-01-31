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
/// Marked @MainActor since all delegates update UI state
///
/// Two-phase download callbacks for progressive UI:
/// 1. `didDetectPhoto` - Called immediately after ObjectInfo, before download starts
/// 2. `didCompleteDownload` - Called after download finishes
/// 3. `didDownloadPhoto` - Legacy single-phase callback (kept for compatibility)
@MainActor
protocol PTPIPSessionDelegate: AnyObject {
    /// Called when session successfully connects
    func sessionDidConnect(_ session: PTPIPSession)

    /// Called immediately when photo is detected (before download)
    /// Provides metadata from GetObjectInfo for showing placeholder UI
    func session(
        _ session: PTPIPSession,
        didDetectPhoto objectHandle: UInt32,
        filename: String,
        captureDate: Date,
        fileSize: Int
    )

    /// Called when photo download completes
    func session(
        _ session: PTPIPSession,
        didCompleteDownload objectHandle: UInt32,
        data: Data
    )

    /// Called when photo download completes (legacy single-phase callback)
    /// Kept for backward compatibility - new code should use didDetectPhoto + didCompleteDownload
    func session(_ session: PTPIPSession, didDownloadPhoto data: Data, objectHandle: UInt32)

    /// Called when a RAW file is skipped (not downloaded)
    func session(_ session: PTPIPSession, didSkipRawFile filename: String)

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
    private var eventSource: CameraEventSource?
    private var photoDownloader: PTPIPPhotoDownloader?
    private var transactionManager: PTPTransactionManager?

    // Camera detection
    private var cameraVendor: CameraVendor = .unknown
    private var isSonyPTPIP = false

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

        PTPLogger.info("Connecting to camera...", category: PTPLogger.session)
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

        // Initialize photo downloader
        self.photoDownloader = PTPIPPhotoDownloader()

        // Configure downloader
        if let downloader = photoDownloader, let txManager = transactionManager {
            await downloader.configure(connection: commandConnection, transactionManager: txManager)
        }

        // Create and start appropriate event source based on camera vendor
        eventSource = createEventSource(for: cameraVendor)
        eventSource?.delegate = self

        // Canon requires initialization before polling
        if cameraVendor == .canon, let canonSource = eventSource as? CanonEventSource {
            try await canonSource.initializeCanonEOS()
        }

        await eventSource?.startMonitoring()

        isConnected = true
        print("[PTPIPSession] Session ready")

        PTPLogger.info("Session connected and ready (vendor: \(cameraVendor))", category: PTPLogger.session)

        delegate?.sessionDidConnect(self)
    }

    /// Prepare session with pre-authenticated connections (SAB-23)
    /// Does Init handshake → OpenSession → SetEventMode, but does NOT start polling
    /// Call startEventMonitoring() later when user selects this camera
    /// - Parameters:
    ///   - commandConnection: Already-authenticated command channel
    ///   - eventConnection: Already-authenticated event channel
    ///   - connectionNumber: Connection number from Init Command Ack
    ///   - cameraName: Camera name for vendor detection
    func prepareSession(
        commandConnection: NWConnection,
        eventConnection: NWConnection,
        connectionNumber: UInt32,
        cameraName: String
    ) async throws {
        guard !isConnected else {
            throw PTPIPSessionError.alreadyConnected
        }

        print("[PTPIPSession] Preparing session (no polling yet)...")
        print("[PTPIPSession] connectionNumber: \(connectionNumber)")

        self.commandConnection = commandConnection
        self.eventConnection = eventConnection
        self.connectionNumber = connectionNumber

        // Detect camera vendor from name
        cameraVendor = detectCameraVendor(from: cameraName)
        print("[PTPIPSession] Camera: \(cameraName) (vendor: \(cameraVendor))")

        isSonyPTPIP = isSonyCamera(named: cameraName)

        // Initialize transaction manager
        self.transactionManager = PTPTransactionManager(sessionID: sessionID)
        print("[PTPIPSession] Transaction manager initialized with sessionID: \(sessionID)")

        // Send OpenSession command (Init handshake was done by scanner)
        print("[PTPIPSession] Sending OpenSession...")
        try await sendOpenSession()
        print("[PTPIPSession] OpenSession successful")

        if isSonyCamera(named: cameraName) {
            print("[PTPIPSession] Initializing Sony SDIO... ")
            try await initializeSonySDIO()
            print("[PTPIPSession] Sony SDIO init complete")
        }

        // Initialize photo downloader (but don't start event monitoring yet)
        self.photoDownloader = PTPIPPhotoDownloader()

        // Configure downloader
        if let downloader = photoDownloader, let txManager = transactionManager {
            await downloader.configure(connection: commandConnection, transactionManager: txManager)
        }

        // Create event source (but don't start monitoring yet)
        eventSource = createEventSource(for: cameraVendor)
        eventSource?.delegate = self

        // For Canon: SetEventMode(1) to enable event reporting
        // This does NOT lock the camera - just subscribes to events
        if cameraVendor == .canon, let canonSource = eventSource as? CanonEventSource {
            print("[PTPIPSession] Initializing Canon EOS (SetEventMode)...")
            try await canonSource.initializeCanonEOS()
            print("[PTPIPSession] Canon EOS initialized")
        }

        isConnected = true
        print("[PTPIPSession] Session prepared (waiting for startEventMonitoring)")

        // Note: We do NOT call delegate?.sessionDidConnect here
        // That will be called when startEventMonitoring() is called
    }

    /// Start event monitoring after session is prepared
    /// Call this when user selects this camera from discovery list
    func startEventMonitoring() {
        guard isConnected else {
            print("[PTPIPSession] Cannot start monitoring - not connected")
            return
        }

        print("[PTPIPSession] Starting event monitoring...")

        // Start event source monitoring
        Task {
            await eventSource?.startMonitoring()
            print("[PTPIPSession] Event monitoring started for vendor: \(cameraVendor)")
        }

        // NOW notify delegate that session is fully ready
        delegate?.sessionDidConnect(self)
    }

    /// Connect using pre-authenticated connections from NetworkScannerService (SAB-23)
    /// Skips Init handshake since scanner already completed it
    /// This is the FULL connection (prepare + start monitoring in one call)
    /// - Parameters:
    ///   - commandConnection: Already-authenticated command channel
    ///   - eventConnection: Already-authenticated event channel
    ///   - connectionNumber: Connection number from Init Command Ack
    ///   - cameraName: Camera name for vendor detection
    func connectWithAuthenticatedConnections(
        commandConnection: NWConnection,
        eventConnection: NWConnection,
        connectionNumber: UInt32,
        cameraName: String
    ) async throws {
        // Prepare session first
        try await prepareSession(
            commandConnection: commandConnection,
            eventConnection: eventConnection,
            connectionNumber: connectionNumber,
            cameraName: cameraName
        )

        // Then immediately start monitoring
        startEventMonitoring()
    }

    /// Disconnect and clean up session
    /// Based on libgphoto2's session teardown pattern
    func disconnect() async {
        guard isConnected else { return }

        print("[PTPIPSession] Disconnecting... CALLED FROM:")
        Thread.callStackSymbols.prefix(10).forEach { print("  \($0)") }

        // Vendor-specific cleanup BEFORE CloseSession (per libgphoto2)
        // cleanup() is responsible for stopping monitoring internally
        if let source = eventSource {
            await source.cleanup()
        }

        // Send CloseSession command after vendor cleanup
        do {
            try await sendCloseSession()
        } catch {
            // Continue with cleanup even if CloseSession fails
        }

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
        eventSource = nil
        photoDownloader = nil
        transactionManager = nil

        isConnected = false
        print("[PTPIPSession] Disconnected")

        PTPLogger.info("Session disconnected", category: PTPLogger.session)

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

        // Log command
        let opCode = PTPOperationCode.openSession
        PTPLogger.debug("Sending \(opCode.name) (\(PTPLogger.formatHex(sessionID))) [txID: \(openCommand.transactionID)]", category: PTPLogger.command)
        PTPLogger.breadcrumb("SendCommand: \(opCode.name)")

        let startTime = Date()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response
        let response = try await receiveResponse(connection: connection, expectedTransactionID: openCommand.transactionID)

        let duration = Date().timeIntervalSince(startTime)

        // Check response code
        guard let responseCode = PTPResponseCode(rawValue: response.responseCode),
              responseCode.isSuccess else {
            PTPLogger.error("\(opCode.name) failed: \(PTPResponseCode(rawValue: response.responseCode)?.name ?? "Unknown") (\(PTPLogger.formatHex(response.responseCode)))", category: PTPLogger.command)
            throw PTPIPSessionError.initializationFailed
        }

        PTPLogger.debug("\(opCode.name) completed in \(PTPLogger.formatDuration(duration)) [code: \(responseCode.name)]", category: PTPLogger.command)
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

        // Log command
        let opCode = PTPOperationCode.closeSession
        PTPLogger.debug("Sending \(opCode.name) [txID: \(closeCommand.transactionID)]", category: PTPLogger.command)

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Read response (may fail if camera already disconnected)
        _ = try? await receiveResponse(connection: connection, expectedTransactionID: closeCommand.transactionID)

        PTPLogger.debug("\(opCode.name) sent", category: PTPLogger.command)
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

        if isSonyPTPIP {
            // Sony PTP/IP often fails storage enumeration; prefer partial object transfer.
            let info = try await getObjectInfo(objectHandle: objectHandle)
            let maxBytes = info.objectCompressedSize
            let photoData = try await downloader.downloadPartialObject(objectHandle: objectHandle, offset: 0, maxBytes: maxBytes)
            return photoData
        }

        let photoData = try await downloader.downloadPhoto(objectHandle: objectHandle)

        // NOTE: We no longer call the legacy didDownloadPhoto delegate here
        // Event sources use the two-phase flow (didDetectPhoto + didCompleteDownload)
        // which provides better UX with immediate placeholders

        return photoData
    }

    /// Download photo when object size is already known
    /// This avoids re-fetching ObjectInfo (Sony path).
    func downloadPhoto(objectHandle: UInt32, maxBytes: UInt32) async throws -> Data {
        guard isConnected else {
            throw PTPIPSessionError.notConnected
        }

        guard let downloader = photoDownloader else {
            throw PTPIPSessionError.notConnected
        }

        if isSonyPTPIP {
            return try await downloader.downloadPartialObject(objectHandle: objectHandle, offset: 0, maxBytes: maxBytes)
        }

        return try await downloader.downloadPhoto(objectHandle: objectHandle)
    }

    /// Get object info by handle
    /// Uses PTP GetObjectInfo command to retrieve metadata about an object
    /// - Parameter objectHandle: Object handle to get info for
    /// - Returns: PTPObjectInfo with file metadata (filename, format, size, etc.)
    func getObjectInfo(objectHandle: UInt32) async throws -> PTPObjectInfo {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        // Create GetObjectInfo command
        var command = await txManager.createCommand()
        let getObjectInfoCmd = command.getObjectInfo(handle: objectHandle)
        let commandData = getObjectInfoCmd.toData()

        // Send command
        try await sendData(connection: connection, data: commandData)

        // Receive response with data (ObjectInfo is returned as data)
        let response = try await receiveDataResponse(
            connection: connection,
            expectedTransactionID: getObjectInfoCmd.transactionID
        )

        guard let objectInfoData = response.data else {
            throw PTPIPSessionError.invalidResponse
        }

        guard let objectInfo = PTPObjectInfo.from(objectInfoData) else {
            throw PTPIPSessionError.invalidResponse
        }

        return objectInfo
    }

    /// Get storage IDs
    /// Uses PTP GetStorageIDs command to retrieve available storage handles
    func getStorageIDs() async throws -> [UInt32] {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()
        let getStorageIDsCmd = command.getStorageIDs()
        let commandData = getStorageIDsCmd.toData()

        try await sendData(connection: connection, data: commandData)

        let response = try await receiveDataResponse(
            connection: connection,
            expectedTransactionID: getStorageIDsCmd.transactionID
        )

        if let responseCode = PTPResponseCode(rawValue: response.response.responseCode), !responseCode.isSuccess {
            print("[PTPIPSession] GetStorageIDs failed: \(responseCode.name) (0x\(String(format: "%04X", response.response.responseCode)))")
            return []
        }

        guard let data = response.data else {
            print("[PTPIPSession] GetStorageIDs returned no data")
            return []
        }

        print("[PTPIPSession] GetStorageIDs raw: \(formatHexBytes(data, limit: 64))")
        let storageIDs = parseUInt32List(data)
        print("[PTPIPSession] GetStorageIDs -> count=\(storageIDs.count) ids=\(storageIDs.map { String(format: "0x%08X", $0) }.joined(separator: ", "))")

        for storageID in storageIDs {
            await logStorageInfo(storageID: storageID)
        }
        return storageIDs
    }

    /// Get storage info (raw data)
    private func getStorageInfo(storageID: UInt32) async throws -> (data: Data?, response: PTPIPOperationResponse) {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()
        let getStorageInfoCmd = command.getStorageInfo(storageID: storageID)
        let commandData = getStorageInfoCmd.toData()

        try await sendData(connection: connection, data: commandData)

        return try await receiveDataResponse(
            connection: connection,
            expectedTransactionID: getStorageInfoCmd.transactionID
        )
    }

    /// Get object handles for a storage ID
    /// Uses PTP GetObjectHandles command to list object handles
    func getObjectHandles(storageID: UInt32) async throws -> [UInt32] {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()
        let getHandlesCmd = command.getObjectHandles(storageID: storageID, associationObject: 0xFFFFFFFF)
        print("[PTPIPSession] GetObjectHandles storageID=0x\(String(format: "%08X", storageID)) parent=0xFFFFFFFF")
        let commandData = getHandlesCmd.toData()

        try await sendData(connection: connection, data: commandData)

        let response = try await receiveDataResponse(
            connection: connection,
            expectedTransactionID: getHandlesCmd.transactionID
        )

        if let responseCode = PTPResponseCode(rawValue: response.response.responseCode), !responseCode.isSuccess {
            print("[PTPIPSession] GetObjectHandles failed: \(responseCode.name) (0x\(String(format: "%04X", response.response.responseCode)))")

            if responseCode == .storeNotAvailable {
                let adjustedStorageID = storageID | 0x00000001
                if adjustedStorageID != storageID {
                    print("[PTPIPSession] Retrying GetObjectHandles with storageID=0x\(String(format: "%08X", adjustedStorageID))")
                    var adjustedCommand = await txManager.createCommand()
                    let adjusted = adjustedCommand.getObjectHandles(storageID: adjustedStorageID, associationObject: 0xFFFFFFFF)
                    let adjustedData = adjusted.toData()
                    try await sendData(connection: connection, data: adjustedData)

                    let adjustedResponse = try await receiveDataResponse(
                        connection: connection,
                        expectedTransactionID: adjusted.transactionID
                    )

                    if let adjustedCode = PTPResponseCode(rawValue: adjustedResponse.response.responseCode), !adjustedCode.isSuccess {
                        print("[PTPIPSession] Adjusted GetObjectHandles failed: \(adjustedCode.name) (0x\(String(format: "%04X", adjustedResponse.response.responseCode)))")
                    } else if let data = adjustedResponse.data {
                        let handles = parseUInt32List(data)
                        print("[PTPIPSession] Adjusted GetObjectHandles -> count=\(handles.count)")
                        return handles
                    }
                }

                print("[PTPIPSession] Retrying GetObjectHandles with storageID=0x00000000")
                var fallbackCommand = await txManager.createCommand()
                let fallback = fallbackCommand.getObjectHandles(storageID: 0x00000000, associationObject: 0xFFFFFFFF)
                let fallbackData = fallback.toData()
                try await sendData(connection: connection, data: fallbackData)

                let fallbackResponse = try await receiveDataResponse(
                    connection: connection,
                    expectedTransactionID: fallback.transactionID
                )

                if let fallbackCode = PTPResponseCode(rawValue: fallbackResponse.response.responseCode), !fallbackCode.isSuccess {
                    print("[PTPIPSession] Fallback GetObjectHandles failed: \(fallbackCode.name) (0x\(String(format: "%04X", fallbackResponse.response.responseCode)))")
                    return []
                }

                if let data = fallbackResponse.data {
                    let handles = parseUInt32List(data)
                    print("[PTPIPSession] Fallback GetObjectHandles -> count=\(handles.count)")
                    return handles
                }
                return []
            }

            return []
        }

        guard let data = response.data else {
            print("[PTPIPSession] GetObjectHandles returned no data")
            return []
        }

        let handles = parseUInt32List(data)
        print("[PTPIPSession] GetObjectHandles -> count=\(handles.count)")
        return handles
    }

    /// Receive response with data packets (Start/Data/End) followed by OperationResponse
    private func receiveDataResponse(connection: NWConnection, expectedTransactionID: UInt32) async throws -> (data: Data?, response: PTPIPOperationResponse) {
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

    private func initializeSonySDIO() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()

        // libgphoto2 sequence for Sony PTP/IP mode:
        // 1) SDIOConnect(1)
        // 2) SDIOConnect(2)
        // 3) GetSDIOGetExtDeviceInfo(0xC8)
        // 4) SDIOConnect(3)

        for step in [UInt32(1), UInt32(2)] {
            let sdioCommand = command.sonySDIOConnect(p1: step)
            let commandData = sdioCommand.toData()

            print("[PTPIPSession] Sony SDIOConnect step=\(step)")
            try await sendData(connection: connection, data: commandData)

            let response = try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: sdioCommand.transactionID
            )

            let code = response.response.responseCode
            if let responseCode = PTPResponseCode(rawValue: code), !responseCode.isSuccess {
                print("[PTPIPSession] Sony SDIOConnect step=\(step) failed: \(responseCode.name) (0x\(String(format: "%04X", code)))")
            } else if code != PTPResponseCode.ok.rawValue {
                print("[PTPIPSession] Sony SDIOConnect step=\(step) returned: 0x\(String(format: "%04X", code))")
            }
        }

        do {
            let extInfoCmd = command.sonyGetSDIOGetExtDeviceInfo(param: 0x000000C8)
            let extInfoData = extInfoCmd.toData()

            print("[PTPIPSession] Sony GetSDIOGetExtDeviceInfo (0xC8)")
            try await sendData(connection: connection, data: extInfoData)

            let extResponse = try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: extInfoCmd.transactionID
            )

            let code = extResponse.response.responseCode
            if let responseCode = PTPResponseCode(rawValue: code), !responseCode.isSuccess {
                print("[PTPIPSession] Sony GetSDIOGetExtDeviceInfo failed: \(responseCode.name) (0x\(String(format: "%04X", code)))")
            } else if code != PTPResponseCode.ok.rawValue {
                print("[PTPIPSession] Sony GetSDIOGetExtDeviceInfo returned: 0x\(String(format: "%04X", code))")
            }

            if let data = extResponse.data {
                print("[PTPIPSession] Sony GetSDIOGetExtDeviceInfo data: \(data.count) bytes")
            } else {
                print("[PTPIPSession] Sony GetSDIOGetExtDeviceInfo data: (none)")
            }
        }

        // Finalize SDIO
        do {
            let sdioCommand = command.sonySDIOConnect(p1: 3)
            let commandData = sdioCommand.toData()

            print("[PTPIPSession] Sony SDIOConnect step=3")
            try await sendData(connection: connection, data: commandData)

            let response = try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: sdioCommand.transactionID
            )

            let code = response.response.responseCode
            if let responseCode = PTPResponseCode(rawValue: code), !responseCode.isSuccess {
                print("[PTPIPSession] Sony SDIOConnect step=3 failed: \(responseCode.name) (0x\(String(format: "%04X", code)))")
            } else if code != PTPResponseCode.ok.rawValue {
                print("[PTPIPSession] Sony SDIOConnect step=3 returned: 0x\(String(format: "%04X", code))")
            }
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

    /// Parse a PTP uint32 list (count + values)
    private func parseUInt32List(_ data: Data) -> [UInt32] {
        guard data.count >= 4 else {
            return []
        }

        let countValue = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        let count = Int(UInt32(littleEndian: countValue))
        var values: [UInt32] = []
        values.reserveCapacity(count)

        var offset = 4
        for _ in 0..<count {
            guard offset + 4 <= data.count else { break }
            let value = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
            values.append(UInt32(littleEndian: value))
            offset += 4
        }

        return values
    }

    private func logStorageInfo(storageID: UInt32) async {
        do {
            let response = try await getStorageInfo(storageID: storageID)

            if let responseCode = PTPResponseCode(rawValue: response.response.responseCode), !responseCode.isSuccess {
                print("[PTPIPSession] GetStorageInfo 0x\(String(format: "%08X", storageID)) failed: \(responseCode.name) (0x\(String(format: "%04X", response.response.responseCode)))")
                return
            }

            guard let data = response.data else {
                print("[PTPIPSession] GetStorageInfo 0x\(String(format: "%08X", storageID)) returned no data")
                return
            }

            print("[PTPIPSession] GetStorageInfo 0x\(String(format: "%08X", storageID)) raw: \(formatHexBytes(data, limit: 96))")

            if data.count >= 6 {
                let storageTypeRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt16.self) }
                let fsTypeRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 2, as: UInt16.self) }
                let accessRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: UInt16.self) }

                let storageType = UInt16(littleEndian: storageTypeRaw)
                let fsType = UInt16(littleEndian: fsTypeRaw)
                let access = UInt16(littleEndian: accessRaw)

                print("[PTPIPSession] GetStorageInfo 0x\(String(format: "%08X", storageID)) type=0x\(String(format: "%04X", storageType)) fs=0x\(String(format: "%04X", fsType)) access=0x\(String(format: "%04X", access))")
            }
        } catch {
            print("[PTPIPSession] GetStorageInfo 0x\(String(format: "%08X", storageID)) error: \(error)")
        }
    }

    private func formatHexBytes(_ data: Data, limit: Int) -> String {
        let slice = data.prefix(limit)
        return slice.map { String(format: "%02X", $0) }.joined(separator: " ")
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

    private func isSonyCamera(named cameraName: String) -> Bool {
        let name = cameraName.lowercased()
        return name.contains("sony") || name.contains("ilce") || name.contains("dsc")
    }

    // MARK: - Event Source Factory

    /// Create appropriate event source for camera vendor
    private func createEventSource(for vendor: CameraVendor) -> CameraEventSource {
        switch vendor {
        case .canon:
            return CanonEventSource(
                commandConnection: commandConnection,
                transactionManager: transactionManager,
                photoOps: self
            )

        case .nikon:
            return NikonEventSource(
                eventConnection: eventConnection,
                photoOps: self
            )

        case .standard, .unknown:
            return StandardEventSource(
                eventConnection: eventConnection,
                photoOps: self,
                allowPolling: !isSonyPTPIP
            )
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

// MARK: - Photo Operations Provider

extension PTPIPSession: PhotoOperationsProvider {
    // getObjectInfo and downloadPhoto are already implemented above
    // This conformance allows event sources to access these operations
}

// MARK: - Camera Event Source Delegate

extension PTPIPSession: CameraEventSourceDelegate {
    /// Phase 1: Photo detected with metadata (before download)
    func eventSource(
        _ source: CameraEventSource,
        didDetectPhoto objectHandle: UInt32,
        filename: String,
        captureDate: Date,
        fileSize: Int
    ) {
        print("[PTPIPSession] Event source detected photo: \(filename)")
        delegate?.session(
            self,
            didDetectPhoto: objectHandle,
            filename: filename,
            captureDate: captureDate,
            fileSize: fileSize
        )
    }

    /// Phase 2: Download completed
    func eventSource(
        _ source: CameraEventSource,
        didCompleteDownload objectHandle: UInt32,
        data: Data
    ) {
        print("[PTPIPSession] Event source completed download: 0x\(String(format: "%08X", objectHandle)) (\(data.count) bytes)")
        delegate?.session(self, didCompleteDownload: objectHandle, data: data)
    }

    func eventSource(_ source: CameraEventSource, didSkipRawFile filename: String) {
        print("[PTPIPSession] Event source skipped RAW: \(filename)")
        delegate?.session(self, didSkipRawFile: filename)
    }

    func eventSource(_ source: CameraEventSource, didFailWithError error: Error) {
        print("[PTPIPSession] Event source error: \(error)")
        delegate?.session(self, didFailWithError: error)
    }

    func eventSourceDidDisconnect(_ source: CameraEventSource) {
        print("[PTPIPSession] Event source disconnected")
        Task {
            await disconnect()
        }
    }
}
