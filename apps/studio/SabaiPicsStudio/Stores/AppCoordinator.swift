//
//  AppCoordinator.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Updated: 2026-01-19 - Transfer Session Architecture
//
//  App-level coordinator managing state machine and service wiring.
//  Two entry paths (auto-discovery, manual IP) converge to TransferSession.
//

import SwiftUI
import Combine
import Network

/// App-level coordinator that manages state machine and service initialization
///
/// State Machine:
/// ```
/// manufacturerSelection → hotspotSetup → discovering ─┬→ transferring
///                                      ↘ manualIPEntry → connecting ─┘
/// ```
///
/// Both auto-discovery and manual IP paths converge to TransferSession.
///
/// Usage:
/// ```swift
/// let coordinator = AppCoordinator()
/// ContentView()
///     .environmentObject(coordinator)
/// ```
@MainActor
class AppCoordinator: ObservableObject {

    // MARK: - App State

    /// Tracks if app initialization is complete (Clerk load + minimum 2s display)
    @Published var appInitialized = false

    // MARK: - Transfer Session

    /// Active transfer session (nil when not transferring)
    /// This is the single source of truth for the active camera and photos
    @Published var transferSession: TransferSession? = nil

    // MARK: - Legacy Stores (Deprecated - kept for backward compatibility)

    /// Connection store (DEPRECATED - use transferSession instead)
    /// Kept temporarily for views that haven't migrated yet
    let connectionStore: ConnectionStore

    /// Photo store (DEPRECATED - use transferSession instead)
    /// Kept temporarily for views that haven't migrated yet
    let photoStore: PhotoStore

    // MARK: - Private Properties

    /// Camera service (for manual IP connection)
    private let cameraService: any CameraServiceProtocol

    /// Combine subscriptions
    private var cancellables = Set<AnyCancellable>()

    /// Persistent GUID for PTP/IP connections
    private static let guidKey = "com.sabaipics.ptpip.guid"

    private var persistentGUID: UUID {
        if let guidString = UserDefaults.standard.string(forKey: Self.guidKey),
           let savedGUID = UUID(uuidString: guidString) {
            return savedGUID
        }
        let newGUID = UUID()
        UserDefaults.standard.set(newGUID.uuidString, forKey: Self.guidKey)
        return newGUID
    }

    // MARK: - Initializers

    /// Initialize with real WiFi camera service (production)
    init() {
        let service = WiFiCameraService()
        self.cameraService = service
        self.connectionStore = ConnectionStore(cameraService: service)
        self.photoStore = PhotoStore(cameraService: service)

        print("[AppCoordinator] Initialized with WiFiCameraService")
    }

    /// Initialize with custom service (for testing)
    init(cameraService: any CameraServiceProtocol) {
        self.cameraService = cameraService
        self.connectionStore = ConnectionStore(cameraService: cameraService)
        self.photoStore = PhotoStore(cameraService: cameraService)

        print("[AppCoordinator] Initialized with custom service: \(type(of: cameraService))")
    }

    // MARK: - Manual IP Path


    /// Create PTP/IP session from manual IP (public for CaptureFlowCoordinator)
    /// Throws error if connection fails - caller handles state transitions
    func createManualSession(ip: String) async throws -> ActiveCamera {
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: 15740)!

        // Create command connection
        let commandConnection = NWConnection(host: host, port: port, using: .tcp)
        commandConnection.start(queue: .main)

        // Wait for connection
        try await waitForConnection(commandConnection, timeout: 10.0)
        print("[AppCoordinator] Command connection ready")

        // Send Init Command Request
        let initRequest = PTPIPInitCommandRequest(guid: persistentGUID, hostName: "sabaipics-studio")
        try await sendData(connection: commandConnection, data: initRequest.toData())

        // Receive Init Command Ack
        let ackHeaderData = try await receiveData(connection: commandConnection, length: 8)
        guard let ackHeader = PTPIPHeader.from(ackHeaderData),
              ackHeader.type == PTPIPPacketType.initCommandAck.rawValue else {
            commandConnection.cancel()
            throw PTPIPSessionError.initFailed
        }

        // Read payload
        let ackPayloadLength = Int(ackHeader.length) - 8
        let ackPayload = try await receiveData(connection: commandConnection, length: ackPayloadLength)

        // Extract connection number
        let connectionNumber = ackPayload.withUnsafeBytes {
            UInt32(littleEndian: $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self))
        }

        // Extract camera name
        var cameraName = "Camera"
        if ackPayload.count >= 20 {
            let nameData = ackPayload.dropFirst(20)
            if let name = String(data: nameData, encoding: .utf16LittleEndian)?
                .trimmingCharacters(in: .controlCharacters), !name.isEmpty {
                cameraName = name
            }
        }

        print("[AppCoordinator] Connected to: \(cameraName)")

        // Create event connection
        let eventConnection = NWConnection(host: host, port: port, using: .tcp)
        eventConnection.start(queue: .main)
        try await waitForConnection(eventConnection, timeout: 5.0)

        // Send Init Event Request
        let eventRequest = PTPIPInitEventRequest(connectionNumber: connectionNumber)
        try await sendData(connection: eventConnection, data: eventRequest.toData())

        // Receive Init Event Ack
        let eventAckData = try await receiveData(connection: eventConnection, length: 8)
        guard let eventAckHeader = PTPIPHeader.from(eventAckData),
              eventAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
            commandConnection.cancel()
            eventConnection.cancel()
            throw PTPIPSessionError.initFailed
        }

        print("[AppCoordinator] Event channel handshake complete")

        // Create and prepare PTP/IP session
        let sessionID = UInt32.random(in: 1...UInt32.max)
        let session = PTPIPSession(sessionID: sessionID, guid: persistentGUID)

        try await session.prepareSession(
            commandConnection: commandConnection,
            eventConnection: eventConnection,
            connectionNumber: connectionNumber,
            cameraName: cameraName
        )

        print("[AppCoordinator] Session prepared")

        return ActiveCamera(
            name: cameraName,
            ipAddress: ip,
            session: session
        )
    }

    // MARK: - Transfer Session Management

    /// Start transfer session with active camera
    /// Both discovery and manual IP paths converge here
    func startTransferSession(with camera: ActiveCamera) {
        print("[AppCoordinator] Starting transfer session with: \(camera.name)")

        // Create transfer session
        let session = TransferSession(camera: camera)
        self.transferSession = session

        // Update legacy stores for backward compatibility
        connectionStore.cameraName = camera.name
        connectionStore.connectedIP = camera.ipAddress
        connectionStore.connectionState = .connected

        print("[AppCoordinator] Transfer session active")
    }

    // MARK: - Helper Methods

    private func waitForConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    var resumed = false
                    connection.stateUpdateHandler = { state in
                        guard !resumed else { return }
                        switch state {
                        case .ready:
                            resumed = true
                            continuation.resume()
                        case .failed(let error):
                            resumed = true
                            continuation.resume(throwing: error)
                        case .cancelled:
                            resumed = true
                            continuation.resume(throwing: CancellationError())
                        default:
                            break
                        }
                    }
                }
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw NSError(domain: "AppCoordinator", code: -1,
                             userInfo: [NSLocalizedDescriptionKey: "Connection timeout"])
            }

            _ = try await group.next()!
            group.cancelAll()
        }
    }

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

    private func receiveData(connection: NWConnection, length: Int) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if isComplete {
                    continuation.resume(throwing: NSError(domain: "AppCoordinator", code: -2,
                                                         userInfo: [NSLocalizedDescriptionKey: "Connection closed"]))
                } else if let data = content {
                    continuation.resume(returning: data)
                } else {
                    continuation.resume(throwing: NSError(domain: "AppCoordinator", code: -3,
                                                         userInfo: [NSLocalizedDescriptionKey: "No data received"]))
                }
            }
        }
    }
}
