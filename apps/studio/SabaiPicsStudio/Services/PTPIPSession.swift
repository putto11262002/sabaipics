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
import os.lock
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
    case timeout

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
        case .timeout: return "Timed out waiting for camera"
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

    // Standard PTP push events (event channel)
    private let eventMonitor = PTPIPEventMonitor()
    private var eventObjectAddedStreamInstance: AsyncStream<UInt32>?
    private var eventObjectAddedStreamContinuation: AsyncStream<UInt32>.Continuation?

    private var isEventChannelMonitoring = false
    private var startEventChannelMonitoringTask: Task<Void, Never>?

    private var hasStartedEventMonitoring = false
    private var startEventMonitoringTask: Task<Void, Never>?

    // Unified photo pipeline (consume handles -> GetObjectInfo -> download)
    private struct PhotoJob: Sendable {
        let logicalHandle: UInt32
        let downloadHandle: UInt32
        let objectInfo: PTPObjectInfo?
        let maxBytes: UInt32?
    }
    private var photoJobContinuation: AsyncStream<PhotoJob>.Continuation?
    private var photoJobTask: Task<Void, Never>?
    private var seenLogicalHandles = Set<UInt32>()

    // Camera detection
    private var cameraVendor: CameraVendor = .unknown
    private var isSonyPTPIP = false
    private var cameraNameHint: String? = nil

    // Best-effort DeviceInfo (used to refine vendor detection)
    private var deviceInfoManufacturer: String? = nil
    private var deviceInfoVendorExtensionID: UInt32? = nil
    private var deviceInfoModel: String? = nil

    // Configuration
    private let hostName: String
    private let guid: UUID

    private let commandQueue = PTPIPCommandQueue()

    private let commandTimeout: TimeInterval = 10.0

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
                cameraNameHint = cameraName
                cameraVendor = detectCameraVendor(from: cameraName)
                isSonyPTPIP = isSonyCamera(named: cameraName)
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

        // Refine vendor detection from DeviceInfo (camera name often omits manufacturer)
        await updateVendorFromDeviceInfo(cameraNameHint: cameraNameHint)

        if isSonyPTPIP {
            print("[PTPIPSession] Initializing Sony SDIO... ")
            try await initializeSonySDIO()
            print("[PTPIPSession] Sony SDIO init complete")
        }

        // Initialize photo downloader
        self.photoDownloader = PTPIPPhotoDownloader()

        // Configure downloader
        if let downloader = photoDownloader, let txManager = transactionManager {
            await downloader.configure(connection: commandConnection, transactionManager: txManager, commandQueue: commandQueue)
        }

        // Create and start appropriate event source based on camera vendor
        eventSource = createEventSource(for: cameraVendor)
        eventSource?.delegate = self

        // Canon requires initialization before polling
        if cameraVendor == .canon, let canonSource = eventSource as? CanonEventSource {
            try await canonSource.initializeCanonEOS()
        }

        isConnected = true
        print("[PTPIPSession] Session prepared (starting monitoring)")

        PTPLogger.info("Session prepared (vendor: \(cameraVendor))", category: PTPLogger.session)

        // Start event monitoring immediately for direct-connect flows.
        startEventMonitoring()
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

        // Refine vendor detection from DeviceInfo (camera name often omits manufacturer)
        cameraNameHint = cameraName
        await updateVendorFromDeviceInfo(cameraNameHint: cameraName)

        if isSonyCamera(named: cameraName) {
            print("[PTPIPSession] Initializing Sony SDIO... ")
            try await initializeSonySDIO()
            print("[PTPIPSession] Sony SDIO init complete")
        }

        // Initialize photo downloader (but don't start event monitoring yet)
        self.photoDownloader = PTPIPPhotoDownloader()

        // Configure downloader
        if let downloader = photoDownloader, let txManager = transactionManager {
            await downloader.configure(connection: commandConnection, transactionManager: txManager, commandQueue: commandQueue)
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

        guard !hasStartedEventMonitoring else {
            return
        }
        hasStartedEventMonitoring = true

        print("[PTPIPSession] Starting event monitoring...")

        // Start unified photo pipeline
        startPhotoPipelineIfNeeded()

        startEventMonitoringTask?.cancel()
        startEventMonitoringTask = Task { [weak self] in
            guard let self else { return }

            // If the selected strategy consumes the event channel, bring up the event monitor
            // before starting the strategy to avoid missing early ObjectAdded pushes.
            if (self.eventSource?.usesEventChannel ?? false), let eventConnection = self.eventConnection {
                _ = self.eventObjectAddedStream()
                await self.startEventChannelMonitoring(connection: eventConnection)
                self.isEventChannelMonitoring = true
            }

            await self.eventSource?.startMonitoring()
            print("[PTPIPSession] Event monitoring started for vendor: \(self.cameraVendor)")

            // Notify delegate that monitoring is active.
            self.delegate?.sessionDidConnect(self)
        }
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

        // Prevent event-monitor callbacks from surfacing disconnect during teardown.
        isConnected = false

        hasStartedEventMonitoring = false
        startEventMonitoringTask?.cancel()
        startEventMonitoringTask = nil

        startEventChannelMonitoringTask?.cancel()
        startEventChannelMonitoringTask = nil

        print("[PTPIPSession] Disconnecting... CALLED FROM:")
        Thread.callStackSymbols.prefix(10).forEach { print("  \($0)") }

        // Vendor-specific cleanup BEFORE CloseSession (per libgphoto2)
        // cleanup() is responsible for stopping monitoring internally
        if let source = eventSource {
            await source.cleanup()
        }

        // Stop event channel monitor and photo pipeline
        await stopEventChannelMonitoring()
        stopPhotoPipeline()

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

        let (response, duration) = try await commandQueue.run { [self] in
            let startTime = Date()

            // Send command
            try await sendData(connection: connection, data: commandData)

            // Read response
            let response = try await receiveResponse(connection: connection, expectedTransactionID: openCommand.transactionID)

            let duration = Date().timeIntervalSince(startTime)
            return (response, duration)
        }

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

        try await commandQueue.run { [self] in
            // Send command
            try await sendData(connection: connection, data: commandData)

            // Read response (may fail if camera already disconnected)
            _ = try? await receiveResponse(connection: connection, expectedTransactionID: closeCommand.transactionID)
        }

        PTPLogger.debug("\(opCode.name) sent", category: PTPLogger.command)
    }

    /// Read DeviceInfo dataset (ISO 15740) to identify manufacturer/model.
    ///
    /// This is more reliable than the PTP/IP Init "camera name" string.
    private func readDeviceInfoData() async throws -> Data {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        var command = await txManager.createCommand()
        let request = command.getDeviceInfo()
        let requestData = request.toData()

        let opCode = PTPOperationCode.getDeviceInfo
        PTPLogger.debug("Sending \(opCode.name) [txID: \(request.transactionID)]", category: PTPLogger.command)

        let (data, response) = try await commandQueue.run { [self] in
            try await sendData(connection: connection, data: requestData)
            return try await receiveDataResponse(connection: connection, expectedTransactionID: request.transactionID)
        }

        guard let responseCode = PTPResponseCode(rawValue: response.responseCode), responseCode.isSuccess else {
            throw PTPIPSessionError.initializationFailed
        }

        guard let data else {
            throw PTPIPSessionError.invalidResponse
        }

        return data
    }

    private struct DeviceInfoSummary {
        let vendorExtensionID: UInt32?
        let manufacturer: String?
        let model: String?
    }

    private func updateVendorFromDeviceInfo(cameraNameHint: String?) async {
        do {
            let data = try await readDeviceInfoData()
            guard let summary = parseDeviceInfoSummary(data) else {
                PTPLogger.debug("GetDeviceInfo parse failed", category: PTPLogger.session)
                return
            }

            deviceInfoManufacturer = summary.manufacturer
            deviceInfoVendorExtensionID = summary.vendorExtensionID
            deviceInfoModel = summary.model

            let refined = detectCameraVendor(
                cameraName: cameraNameHint ?? self.cameraNameHint ?? "",
                manufacturer: summary.manufacturer
            )

            if refined != cameraVendor {
                PTPLogger.info(
                    "Vendor refined: \(cameraVendor) -> \(refined) (manufacturer=\(summary.manufacturer ?? "n/a"))",
                    category: PTPLogger.session
                )
                cameraVendor = refined
            }

            // Observed behavior (Nikon Z6, WiFi PTP/IP): the camera can also push standard
            // PTP events over the event channel, but we still prefer the Nikon polling path
            // when DeviceInfo Manufacturer indicates Nikon to support bodies/modes that
            // require Nikon_GetEvent (0x90C7).

            if let manufacturer = summary.manufacturer {
                print("[PTPIPSession] DeviceInfo: manufacturer=\(manufacturer), model=\(summary.model ?? "n/a"), vendorExtID=\(summary.vendorExtensionID.map { PTPLogger.formatHex($0) } ?? "n/a")")
            }
        } catch {
            // Best-effort only. Session can still operate with name-based heuristics.
            PTPLogger.debug("GetDeviceInfo failed: \(error)", category: PTPLogger.session)
        }
    }

    private func parseDeviceInfoSummary(_ data: Data) -> DeviceInfoSummary? {
        struct Cursor {
            var data: Data
            var offset: Int = 0

            mutating func readU8() -> UInt8? {
                guard offset + 1 <= data.count else { return nil }
                let v = data[offset]
                offset += 1
                return v
            }

            mutating func readU16() -> UInt16? {
                guard offset + 2 <= data.count else { return nil }
                let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
                offset += 2
                return UInt16(littleEndian: raw)
            }

            mutating func readU32() -> UInt32? {
                guard offset + 4 <= data.count else { return nil }
                let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
                offset += 4
                return UInt32(littleEndian: raw)
            }

            mutating func readPTPString() -> String? {
                guard let len = readU8() else { return nil }
                if len == 0 {
                    return ""
                }

                let byteCount = Int(len) * 2
                guard offset + byteCount <= data.count else { return nil }
                let strData = data.subdata(in: offset..<(offset + byteCount))
                offset += byteCount
                let s = String(data: strData, encoding: .utf16LittleEndian)
                return s?.trimmingCharacters(in: CharacterSet(charactersIn: "\u{0000}"))
            }

            mutating func skipU16Array() -> Bool {
                guard let count = readU32() else { return false }
                let bytes = Int(count) * 2
                guard bytes >= 0, offset + bytes <= data.count else { return false }
                offset += bytes
                return true
            }
        }

        var c = Cursor(data: data)

        // DeviceInfo dataset (ISO 15740)
        _ = c.readU16() // StandardVersion
        let vendorExtID = c.readU32()
        _ = c.readU16() // VendorExtensionVersion
        _ = c.readPTPString() // VendorExtensionDesc
        _ = c.readU16() // FunctionalMode

        // Arrays (UINT16 element arrays)
        guard c.skipU16Array(), c.skipU16Array(), c.skipU16Array(), c.skipU16Array(), c.skipU16Array() else {
            return nil
        }

        let manufacturer = c.readPTPString()
        let model = c.readPTPString()

        return DeviceInfoSummary(
            vendorExtensionID: vendorExtID,
            manufacturer: manufacturer,
            model: model
        )
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

    /// Sony-only: read ObjectInMemory device property (0xD215).
    ///
    /// Rocc/libgphoto2 gate downloads on `value >= 0x8000` for the in-memory handle (0xFFFFC001).
    func getSonyObjectInMemoryValue() async throws -> UInt16? {
        guard isSonyPTPIP else {
            return nil
        }

        // Prefer Sony GetAllDevicePropData (0x9209) to avoid stale/cached values.
        if let fromAll = try await getSonyAllDevicePropDataCurrentValue(propCode: 0xD215) {
            return fromAll
        }

        let value = try await getDevicePropDescCurrentValue(propCode: 0xD215)
        guard let value else {
            return nil
        }

        return UInt16(truncatingIfNeeded: value)
    }

    private func getSonyAllDevicePropDataCurrentValue(propCode: UInt16) async throws -> UInt16? {
        guard isSonyPTPIP,
              let connection = commandConnection,
              let txManager = transactionManager else {
            return nil
        }

        return try await commandQueue.run { [self] in
            var command = await txManager.createCommand()
            let request = command.sonyGetAllDevicePropData(partial: false)
            let requestData = request.toData()

            try await sendData(connection: connection, data: requestData)

            let response = try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: request.transactionID
            )

            if let responseCode = PTPResponseCode(rawValue: response.response.responseCode), !responseCode.isSuccess {
                return nil
            }

            guard let data = response.data else {
                return nil
            }

            return parseSonyAllDevicePropDataCurrentValue(data, targetPropCode: propCode)
        }
    }

    private func parseSonyAllDevicePropDataCurrentValue(_ data: Data, targetPropCode: UInt16) -> UInt16? {
        // Format (per Rocc):
        // QWord numberOfProperties, then repeated DeviceProperty blocks.
        guard data.count >= 8 else { return nil }

        var offset = 0
        let countRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt64.self) }
        let count = Int(UInt64(littleEndian: countRaw))
        offset += 8

        func readUInt8() -> UInt8? {
            guard offset + 1 <= data.count else { return nil }
            defer { offset += 1 }
            return data[offset]
        }

        func readUInt16() -> UInt16? {
            guard offset + 2 <= data.count else { return nil }
            let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
            offset += 2
            return UInt16(littleEndian: raw)
        }

        func readUInt32() -> UInt32? {
            guard offset + 4 <= data.count else { return nil }
            let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
            offset += 4
            return UInt32(littleEndian: raw)
        }

        func readUInt64() -> UInt64? {
            guard offset + 8 <= data.count else { return nil }
            let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt64.self) }
            offset += 8
            return UInt64(littleEndian: raw)
        }

        func skipPTPString() -> Bool {
            // PTP string: UInt8 count (num UTF-16 chars, including NUL), followed by that many UTF-16LE code units.
            guard let count8 = readUInt8() else { return false }
            let bytes = Int(count8) * 2
            guard offset + bytes <= data.count else { return false }
            offset += bytes
            return true
        }

        func skipValue(dataType: UInt16) -> Bool {
            switch dataType {
            case 0x0001, 0x0002: // int8/uint8
                return readUInt8() != nil
            case 0x0003, 0x0004: // int16/uint16
                return readUInt16() != nil
            case 0x0005, 0x0006: // int32/uint32
                return readUInt32() != nil
            case 0x0007, 0x0008: // int64/uint64
                return readUInt64() != nil
            case 0xFFFF: // string
                return skipPTPString()
            default:
                return false
            }
        }

        func readValueAsUInt16IfPossible(dataType: UInt16) -> UInt16? {
            switch dataType {
            case 0x0002: // uint8
                return readUInt8().map { UInt16($0) }
            case 0x0004: // uint16
                return readUInt16()
            case 0x0006: // uint32
                return readUInt32().map { UInt16(truncatingIfNeeded: $0) }
            default:
                // Consume the bytes but cannot represent as UInt16.
                _ = skipValue(dataType: dataType)
                return nil
            }
        }

        for _ in 0..<count {
            guard let propCode = readUInt16(),
                  let dataType = readUInt16() else {
                return nil
            }

            // getSetSupported + getSetAvailable
            _ = readUInt8()
            _ = readUInt8()

            // factory
            guard skipValue(dataType: dataType) else { return nil }

            // current
            let currentStartOffset = offset
            let currentUInt16: UInt16?
            if propCode == targetPropCode {
                currentUInt16 = readValueAsUInt16IfPossible(dataType: dataType)
            } else {
                currentUInt16 = nil
                guard skipValue(dataType: dataType) else { return nil }
            }

            // structure/form flag
            guard let structure = readUInt8() else { return nil }

            // Skip form data so we can continue iterating.
            switch structure {
            case 0x01: // range
                guard skipValue(dataType: dataType), skipValue(dataType: dataType), skipValue(dataType: dataType) else { return nil }
            case 0x02: // enumeration
                guard let elements = readUInt16() else { return nil }
                for _ in 0..<elements {
                    guard skipValue(dataType: dataType) else { return nil }
                }
            default:
                break
            }

            if propCode == targetPropCode {
                // If we couldn't decode to UInt16, log once for debugging.
                if currentUInt16 == nil {
                    let consumed = offset - currentStartOffset
                    print("[PTPIPSession] Sony GetAllDevicePropData 0x\(String(format: "%04X", targetPropCode)) currentValue undecodable (type=0x\(String(format: "%04X", dataType)) bytes=\(consumed))")
                }
                return currentUInt16
            }
        }

        return nil
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

        return try await commandQueue.run { [self] in

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
    }

    /// Get storage IDs
    /// Uses PTP GetStorageIDs command to retrieve available storage handles
    func getStorageIDs() async throws -> [UInt32] {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        let storageIDs: [UInt32] = try await commandQueue.run { [self] in
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
                return [UInt32]()
            }

            guard let data = response.data else {
                print("[PTPIPSession] GetStorageIDs returned no data")
                return [UInt32]()
            }

            print("[PTPIPSession] GetStorageIDs raw: \(formatHexBytes(data, limit: 64))")
            return parseUInt32List(data)
        }

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

        return try await commandQueue.run { [self] in
            var command = await txManager.createCommand()
            let getStorageInfoCmd = command.getStorageInfo(storageID: storageID)
            let commandData = getStorageInfoCmd.toData()

            try await sendData(connection: connection, data: commandData)

            return try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: getStorageInfoCmd.transactionID
            )
        }
    }

    /// Get object handles for a storage ID
    /// Uses PTP GetObjectHandles command to list object handles
    func getObjectHandles(storageID: UInt32) async throws -> [UInt32] {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        return try await commandQueue.run { [self] in
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

    // MARK: - Command Execution

    /// Execute a single PTP operation on the shared command channel.
    ///
    /// This is the preferred boundary for all command-channel I/O:
    /// - serializes access via `commandQueue`
    /// - allocates transaction IDs via `transactionManager`
    /// - uses deadlines in `sendData` / `receiveData`
    func executeOperation(
        _ buildRequest: @escaping @Sendable (inout PTPCommand) -> PTPIPOperationRequest
    ) async throws -> (data: Data?, response: PTPIPOperationResponse) {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        return try await commandQueue.run { [self] in
            var command = await txManager.createCommand()
            let request = buildRequest(&command)
            let requestData = request.toData()

            try await sendData(connection: connection, data: requestData)
            return try await receiveDataResponse(connection: connection, expectedTransactionID: request.transactionID)
        }
    }

    // MARK: - Helper Methods

    /// Send data to connection
    private func sendData(connection: NWConnection, data: Data) async throws {
        do {
            try await PTPIPIO.sendWithTimeout(connection: connection, data: data, timeout: commandTimeout)
        } catch PTPIPIOError.timeout {
            throw PTPIPSessionError.timeout
        }
    }

    private func initializeSonySDIO() async throws {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        try await commandQueue.run { [self] in
            // Reserve exactly the number of op requests we issue here.
            // Keep transaction IDs contiguous for Sony.
            var command = await txManager.createCommand(reserve: 5)

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

            // Rocc performs an extra Sony handshake request after SDIO init.
            do {
                let handshake = command.sonyUnknownHandshakeRequest()
                let handshakeData = handshake.toData()

                print("[PTPIPSession] Sony UnknownHandshakeRequest (0x920D)")
                try await sendData(connection: connection, data: handshakeData)

                let response = try await receiveDataResponse(
                    connection: connection,
                    expectedTransactionID: handshake.transactionID
                )

                let code = response.response.responseCode
                if let responseCode = PTPResponseCode(rawValue: code), !responseCode.isSuccess {
                    print("[PTPIPSession] Sony UnknownHandshakeRequest failed: \(responseCode.name) (0x\(String(format: "%04X", code)))")
                } else if code != PTPResponseCode.ok.rawValue {
                    print("[PTPIPSession] Sony UnknownHandshakeRequest returned: 0x\(String(format: "%04X", code))")
                }
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
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            // Timeout task
            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                var shouldResume = false
                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true
                }
                if shouldResume {
                    continuation.resume(throwing: PTPIPSessionError.connectionFailed)
                }
            }

            connection.stateUpdateHandler = { state in
                var shouldResume = false
                var resumeOK = false
                var resumeError: Error?

                lock.withLock {
                    guard !resumed else { return }
                    switch state {
                    case .ready:
                        resumed = true
                        shouldResume = true
                        resumeOK = true
                    case .failed(let error):
                        resumed = true
                        shouldResume = true
                        resumeError = error
                    default:
                        break
                    }
                }

                guard shouldResume else { return }
                timeoutTask.cancel()
                if resumeOK {
                    continuation.resume()
                } else if let resumeError {
                    continuation.resume(throwing: resumeError)
                }
            }
        }
    }

    /// Receive data from connection
    private func receiveData(connection: NWConnection, length: Int) async throws -> Data {
        do {
            return try await PTPIPIO.receiveExactWithTimeout(connection: connection, length: length, timeout: commandTimeout)
        } catch PTPIPIOError.timeout {
            throw PTPIPSessionError.timeout
        } catch PTPIPIOError.connectionClosed {
            throw PTPIPSessionError.connectionFailed
        } catch PTPIPIOError.emptyRead {
            throw PTPIPSessionError.connectionFailed
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

    private func getDevicePropDescCurrentValue(propCode: UInt16) async throws -> UInt32? {
        guard let connection = commandConnection,
              let txManager = transactionManager else {
            throw PTPIPSessionError.notConnected
        }

        return try await commandQueue.run { [self] in

            var command = await txManager.createCommand()
            // Sony often requires the vendor variant of GetDevicePropDesc (0x9203).
            let request = isSonyPTPIP
                ? command.sonyGetDevicePropDesc(propCode: propCode)
                : command.getDevicePropDesc(propCode: propCode)
            let requestData = request.toData()

            try await sendData(connection: connection, data: requestData)

            let response = try await receiveDataResponse(
                connection: connection,
                expectedTransactionID: request.transactionID
            )

            if let responseCode = PTPResponseCode(rawValue: response.response.responseCode), !responseCode.isSuccess {
                print("[PTPIPSession] GetDevicePropDesc 0x\(String(format: "%04X", propCode)) failed: \(responseCode.name) (0x\(String(format: "%04X", response.response.responseCode)))")

                // Fallback: if Sony vendor opcode failed, try standard opcode once.
                if isSonyPTPIP {
                    var fallbackCommand = await txManager.createCommand()
                    let fallback = fallbackCommand.getDevicePropDesc(propCode: propCode)
                    let fallbackData = fallback.toData()
                    try await sendData(connection: connection, data: fallbackData)

                    let fallbackResponse = try await receiveDataResponse(
                        connection: connection,
                        expectedTransactionID: fallback.transactionID
                    )

                    if let fallbackCode = PTPResponseCode(rawValue: fallbackResponse.response.responseCode), !fallbackCode.isSuccess {
                        print("[PTPIPSession] GetDevicePropDesc fallback 0x\(String(format: "%04X", propCode)) failed: \(fallbackCode.name) (0x\(String(format: "%04X", fallbackResponse.response.responseCode)))")
                        return nil
                    }

                    guard let data = fallbackResponse.data else {
                        print("[PTPIPSession] GetDevicePropDesc fallback 0x\(String(format: "%04X", propCode)) returned no data")
                        return nil
                    }

                    return parseDevicePropDescCurrentValue(data, expectedPropCode: propCode)
                }

                return nil
            }

            guard let data = response.data else {
                print("[PTPIPSession] GetDevicePropDesc 0x\(String(format: "%04X", propCode)) returned no data")
                return nil
            }

            return parseDevicePropDescCurrentValue(data, expectedPropCode: propCode)
        }
    }

    private func parseDevicePropDescCurrentValue(_ data: Data, expectedPropCode: UInt16) -> UInt32? {
        // PTP DevicePropDesc:
        // u16 propCode, u16 dataType, u8 getSet, factoryDefault (type), currentValue (type), formFlag...
        guard data.count >= 5 else {
            return nil
        }

        let propCodeRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt16.self) }
        let dataTypeRaw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 2, as: UInt16.self) }
        let propCode = UInt16(littleEndian: propCodeRaw)
        let dataType = UInt16(littleEndian: dataTypeRaw)

        if propCode != expectedPropCode {
            print("[PTPIPSession] GetDevicePropDesc mismatch: expected=0x\(String(format: "%04X", expectedPropCode)) got=0x\(String(format: "%04X", propCode))")
        }

        func parseWithOffset(_ startOffset: Int) -> UInt32? {
            var offset = startOffset

            func readUInt8() -> UInt32? {
                guard offset + 1 <= data.count else { return nil }
                let v = data[offset]
                offset += 1
                return UInt32(v)
            }

            func readUInt16() -> UInt32? {
                guard offset + 2 <= data.count else { return nil }
                let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
                offset += 2
                return UInt32(UInt16(littleEndian: raw))
            }

            func readUInt32() -> UInt32? {
                guard offset + 4 <= data.count else { return nil }
                let raw = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
                offset += 4
                return UInt32(littleEndian: raw)
            }

            // Only need factory + current value.
            // Data type codes (PTP spec): UINT8=0x0002, UINT16=0x0004, UINT32=0x0006.
            let readValue: () -> UInt32? = {
                switch dataType {
                case 0x0002: return readUInt8()
                case 0x0004: return readUInt16()
                case 0x0006: return readUInt32()
                default:
                    return nil
                }
            }

            _ = readValue() // factory default
            return readValue()
        }

        // Sony vendor desc includes two bytes after dataType (supported+available).
        // Standard PTP uses one byte. Try Sony format first, then standard.
        return parseWithOffset(6) ?? parseWithOffset(5)
    }

    // MARK: - Camera Vendor Detection

    /// Detect camera vendor from camera name
    /// Based on libgphoto2's vendor detection logic
    private func detectCameraVendor(from cameraName: String) -> CameraVendor {
        return detectCameraVendor(cameraName: cameraName, manufacturer: nil)
    }

    /// Detect vendor using DeviceInfo manufacturer when available.
    private func detectCameraVendor(cameraName: String, manufacturer: String?) -> CameraVendor {
        if let manufacturer {
            let m = manufacturer.lowercased()
            if m.contains("canon") {
                return .canon
            }
            if m.contains("nikon") {
                return .nikon
            }
            // Sony typically uses standard PTP events (with additional SDIO init for PTP/IP mode)
            if m.contains("sony") {
                return .standard
            }
        }

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
            return CanonEventSource(session: self)

        case .nikon:
            return NikonEventSource(session: self)

        case .standard, .unknown:
            if isSonyPTPIP {
                return SonyEventSource(session: self)
            }
            return StandardEventSource(session: self, allowPolling: true)
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

// MARK: - Standard Event Channel

@MainActor
extension PTPIPSession: PTPIPEventMonitorDelegate {
    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didReceiveObjectAdded objectHandle: UInt32) {
        Task { @MainActor in
            self.eventObjectAddedStreamContinuation?.yield(objectHandle)
        }
    }

    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error) {
        Task { @MainActor in
            // Session owns disconnect/error policy; surface as session error for now.
            self.delegate?.session(self, didFailWithError: error)
        }
    }

    nonisolated func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor) {
        Task { @MainActor in
            guard self.isConnected else { return }
            self.isConnected = false
            self.delegate?.sessionDidDisconnect(self)
        }
    }
}

extension PTPIPSession {
    private func startEventChannelMonitoringIfNeeded() {
        guard isConnected, hasStartedEventMonitoring else { return }
        guard !isEventChannelMonitoring else { return }
        guard let eventConnection else { return }

        isEventChannelMonitoring = true

        startEventChannelMonitoringTask?.cancel()
        startEventChannelMonitoringTask = Task { [weak self] in
            guard let self else { return }
            await self.startEventChannelMonitoring(connection: eventConnection)
        }
    }

    func startEventChannelMonitoring(connection: NWConnection) async {
        await eventMonitor.setDelegate(self)
        await eventMonitor.startMonitoring(connection: connection)
    }

    func stopEventChannelMonitoring() async {
        startEventChannelMonitoringTask?.cancel()
        startEventChannelMonitoringTask = nil
        isEventChannelMonitoring = false

        await eventMonitor.stopMonitoring()
        await eventMonitor.setDelegate(nil)
        eventObjectAddedStreamContinuation?.finish()
        eventObjectAddedStreamContinuation = nil
        eventObjectAddedStreamInstance = nil
    }

    /// Standard event-channel ObjectAdded stream.
    ///
    /// Lazily starts the event-channel monitor when monitoring is active.
    func eventObjectAddedStream() -> AsyncStream<UInt32> {
        if let existing = eventObjectAddedStreamInstance {
            startEventChannelMonitoringIfNeeded()
            return existing
        }

        let stream = AsyncStream<UInt32> { continuation in
            self.eventObjectAddedStreamContinuation = continuation
        }

        eventObjectAddedStreamInstance = stream
        startEventChannelMonitoringIfNeeded()
        return stream
    }
}

// MARK: - Unified Photo Pipeline

extension PTPIPSession {
    private func startPhotoPipelineIfNeeded() {
        guard photoJobTask == nil else { return }

        let stream = AsyncStream<PhotoJob> { continuation in
            self.photoJobContinuation = continuation
        }

        photoJobTask = Task { [weak self] in
            guard let self else { return }
            for await job in stream {
                if Task.isCancelled { break }
                await self.processPhotoJob(job)
            }
        }
    }

    private func stopPhotoPipeline() {
        photoJobContinuation?.finish()
        photoJobContinuation = nil
        photoJobTask?.cancel()
        photoJobTask = nil
        seenLogicalHandles.removeAll()
    }

    /// Entry point for vendor strategies to report a new object handle.
    /// The unified photo pipeline will fetch ObjectInfo, filter, and download.
    func enqueueObjectHandle(_ handle: UInt32) {
        enqueuePhotoJob(
            logicalHandle: handle,
            downloadHandle: handle,
            objectInfo: nil,
            maxBytes: nil
        )
    }

    /// Entry point for vendor strategies that already resolved ObjectInfo and/or need
    /// a different logical handle than the download handle (e.g. Sony in-memory).
    func enqueueDetectedPhoto(
        logicalHandle: UInt32,
        downloadHandle: UInt32,
        objectInfo: PTPObjectInfo,
        maxBytes: UInt32?
    ) {
        enqueuePhotoJob(
            logicalHandle: logicalHandle,
            downloadHandle: downloadHandle,
            objectInfo: objectInfo,
            maxBytes: maxBytes
        )
    }

    private func enqueuePhotoJob(
        logicalHandle: UInt32,
        downloadHandle: UInt32,
        objectInfo: PTPObjectInfo?,
        maxBytes: UInt32?
    ) {
        guard !seenLogicalHandles.contains(logicalHandle) else { return }
        seenLogicalHandles.insert(logicalHandle)
        photoJobContinuation?.yield(
            PhotoJob(
                logicalHandle: logicalHandle,
                downloadHandle: downloadHandle,
                objectInfo: objectInfo,
                maxBytes: maxBytes
            )
        )
    }

    private func processPhotoJob(_ job: PhotoJob) async {
        do {
            let info: PTPObjectInfo
            if let provided = job.objectInfo {
                info = provided
            } else {
                info = try await getObjectInfo(objectHandle: job.downloadHandle)
            }

            if info.isRawFile {
                delegate?.session(self, didSkipRawFile: info.filename)
                return
            }

            guard info.isJpegFile else {
                return
            }

            delegate?.session(
                self,
                didDetectPhoto: job.logicalHandle,
                filename: info.filename,
                captureDate: Date(),
                fileSize: Int(info.objectCompressedSize)
            )

            let data: Data
            if let maxBytes = job.maxBytes {
                data = try await downloadPhoto(objectHandle: job.downloadHandle, maxBytes: maxBytes)
            } else {
                data = try await downloadPhoto(objectHandle: job.downloadHandle)
            }
            delegate?.session(self, didCompleteDownload: job.logicalHandle, data: data)
        } catch {
            delegate?.session(self, didFailWithError: error)
        }
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
