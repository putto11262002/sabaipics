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

    /// Current app state (determines which view to show)
    @Published var appState: AppState = .manufacturerSelection

    /// Selected camera manufacturer
    @Published var selectedManufacturer: CameraManufacturer? = nil

    /// Discovered cameras from network scan
    @Published var discoveredCameras: [DiscoveredCamera] = []

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

    // MARK: - Navigation Actions

    /// Select camera manufacturer
    /// Checks hotspot status and navigates accordingly
    func selectManufacturer(_ manufacturer: CameraManufacturer) {
        print("[AppCoordinator] Manufacturer selected: \(manufacturer.rawValue)")
        selectedManufacturer = manufacturer

        if NetworkScannerService.isHotspotActive() {
            print("[AppCoordinator] Hotspot detected, proceeding to discovery")
            appState = .discovering
        } else {
            print("[AppCoordinator] No hotspot detected, showing setup instructions")
            appState = .hotspotSetup
        }
    }

    /// Proceed from hotspot setup to camera discovery
    func proceedToDiscovery() {
        print("[AppCoordinator] Proceeding to camera discovery")
        appState = .discovering
    }

    /// Skip to manual IP entry
    func skipToManualEntry() {
        print("[AppCoordinator] Skipping to manual IP entry")
        appState = .manualIPEntry
    }

    /// Go back to manufacturer selection
    /// Note: Scanner cleanup (disconnect all cameras) should be called by the view BEFORE this
    func backToManufacturerSelection() {
        print("[AppCoordinator] ⬅️ backToManufacturerSelection()")

        // Clear coordinator's reference to discovered cameras
        // (Scanner already disconnected them via cleanup())
        if !discoveredCameras.isEmpty {
            print("[AppCoordinator]    Clearing \(discoveredCameras.count) camera references")
        }
        discoveredCameras = []
        selectedManufacturer = nil

        appState = .manufacturerSelection
        print("[AppCoordinator]    ✓ State → .manufacturerSelection")
    }

    // MARK: - Discovery Path

    /// Update discovered cameras list
    func updateDiscoveredCameras(_ cameras: [DiscoveredCamera]) {
        print("[AppCoordinator] 📋 updateDiscoveredCameras() count=\(cameras.count)")
        discoveredCameras = cameras
    }

    /// Select a discovered camera and start transfer session
    /// This is Path 1: Auto-discovery → ActiveCamera → TransferSession
    ///
    /// Flow:
    /// 1. Extract session from selected camera
    /// 2. Disconnect OTHER cameras (not the selected one)
    /// 3. Create ActiveCamera → TransferSession
    /// 4. Start monitoring for photos
    func selectDiscoveredCamera(_ camera: DiscoveredCamera) {
        print("[AppCoordinator] ═══════════════════════════════════════════")
        print("[AppCoordinator] 📸 selectDiscoveredCamera: \(camera.name) @ \(camera.ipAddress)")
        print("[AppCoordinator]    Total discovered: \(discoveredCameras.count)")

        // 1. Extract session from discovered camera
        guard let session = camera.extractSession() else {
            print("[AppCoordinator] ❌ No session in camera object!")
            appState = .error("Camera session not ready. Please try scanning again.")
            return
        }

        guard session.connected else {
            print("[AppCoordinator] ❌ Session exists but not connected!")
            appState = .error("Camera disconnected. Please try scanning again.")
            return
        }

        print("[AppCoordinator]    ✓ Session extracted, connected=true")

        // 2. Create ActiveCamera with extracted session
        let activeCamera = ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )
        print("[AppCoordinator]    ✓ ActiveCamera created")

        // 3. Disconnect OTHER discovered cameras (not the selected one)
        let otherCameras = discoveredCameras.filter { $0.ipAddress != camera.ipAddress }
        if !otherCameras.isEmpty {
            print("[AppCoordinator]    🔌 Disconnecting \(otherCameras.count) other camera(s)...")
            Task {
                for otherCamera in otherCameras {
                    print("[AppCoordinator]       - \(otherCamera.name)")
                    await otherCamera.disconnect()
                }
                print("[AppCoordinator]    ✓ Other cameras disconnected")
            }
        } else {
            print("[AppCoordinator]    ✓ No other cameras to disconnect")
        }
        discoveredCameras = []

        // 4. Create TransferSession (starts monitoring automatically)
        print("[AppCoordinator]    🚀 Starting transfer session...")
        startTransferSession(with: activeCamera)
        print("[AppCoordinator] ═══════════════════════════════════════════")
    }

    // MARK: - Manual IP Path

    /// Connect via manual IP address
    /// This is Path 2: Manual IP → connecting → ActiveCamera → TransferSession
    func connectManualIP(_ ip: String) {
        print("[AppCoordinator] Connecting to manual IP: \(ip)")
        appState = .connecting(ip: ip)

        Task {
            do {
                let activeCamera = try await createSession(ip: ip)
                startTransferSession(with: activeCamera)
            } catch {
                print("[AppCoordinator] Manual connection failed: \(error.localizedDescription)")
                appState = .error(error.localizedDescription)
            }
        }
    }

    /// Create PTP/IP session from scratch (for manual IP path)
    private func createSession(ip: String) async throws -> ActiveCamera {
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
    private func startTransferSession(with camera: ActiveCamera) {
        print("[AppCoordinator] Starting transfer session with: \(camera.name)")

        // Create transfer session
        let session = TransferSession(camera: camera)
        self.transferSession = session

        // Update legacy stores for backward compatibility
        connectionStore.cameraName = camera.name
        connectionStore.connectedIP = camera.ipAddress
        connectionStore.connectionState = .connected

        // Transition to transferring state
        appState = .transferring

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
