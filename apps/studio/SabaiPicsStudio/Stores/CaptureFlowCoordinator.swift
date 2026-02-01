//
//  CaptureFlowCoordinator.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-30
//  Isolated capture flow state management
//
//  This coordinator manages capture flow state independently from AppCoordinator,
//  preventing navigation conflicts between the capture sheet and main tab navigation.
//

import SwiftUI
import Combine

@MainActor
class CaptureFlowCoordinator: ObservableObject {
    // MARK: - State

    enum State: Equatable {
        case manufacturerSelection
        case sonyEntry
        case sonyNewCameraDecision
        case sonySSIDJoinStub
        case hotspotSetup
        case discovering
        case manualIPEntry
        case connecting(ip: String)
        case transferring
        case error(String)

        // MARK: - Equatable

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.manufacturerSelection, .manufacturerSelection),
                 (.sonyEntry, .sonyEntry),
                 (.sonyNewCameraDecision, .sonyNewCameraDecision),
                 (.sonySSIDJoinStub, .sonySSIDJoinStub),
                 (.hotspotSetup, .hotspotSetup),
                 (.discovering, .discovering),
                 (.manualIPEntry, .manualIPEntry),
                 (.transferring, .transferring):
                return true
            case let (.connecting(lhsIP), .connecting(rhsIP)):
                return lhsIP == rhsIP
            case let (.error(lhsMsg), .error(rhsMsg)):
                return lhsMsg == rhsMsg
            default:
                return false
            }
        }
    }

    @Published var state: State = .manufacturerSelection

    // MARK: - Capture Flow Data

    var selectedManufacturer: CameraManufacturer?
    var discoveredCameras: [DiscoveredCamera] = []

    // Sony: user-selected previous record to prioritize
    @Published var preferredSonyRecordID: String?

    // MARK: - Active Tasks (for cancellation)

    /// Active connection task (stored for cancellation)
    private var connectionTask: Task<Void, Never>?

    // MARK: - Reference to Global State (for transferSession only)

    weak var appCoordinator: AppCoordinator?

    // MARK: - Navigation Methods (migrated from AppCoordinator)

    func selectManufacturer(_ manufacturer: CameraManufacturer) {
        print("[CaptureFlowCoordinator] Manufacturer selected: \(manufacturer.rawValue)")
        selectedManufacturer = manufacturer

        if manufacturer == .sony {
            print("[CaptureFlowCoordinator] Sony: showing entry screen")
            state = .sonyEntry
            return
        }

        if NetworkScannerService.isHotspotActive() {
            print("[CaptureFlowCoordinator] Hotspot detected, proceeding to discovery")
            state = .discovering
        } else {
            print("[CaptureFlowCoordinator] No hotspot detected, showing setup instructions")
            state = .hotspotSetup
        }
    }

    func proceedToDiscovery() {
        print("[CaptureFlowCoordinator] Proceeding to camera discovery")
        preferredSonyRecordID = nil
        state = .discovering
    }

    func connectToSonyRecord(id: String) {
        preferredSonyRecordID = id
        state = .discovering
    }

    func startSonySetup() {
        print("[CaptureFlowCoordinator] Sony: starting setup wizard")
        preferredSonyRecordID = nil
        state = .hotspotSetup
    }

    func startSonyNewCamera() {
        print("[CaptureFlowCoordinator] Sony: new camera decision")
        preferredSonyRecordID = nil
        state = .sonyNewCameraDecision
    }

    func startSonySSIDStub() {
        print("[CaptureFlowCoordinator] Sony: SSID join stub")
        preferredSonyRecordID = nil
        state = .sonySSIDJoinStub
    }

    func skipToManualEntry() {
        print("[CaptureFlowCoordinator] Skipping to manual IP entry")
        state = .manualIPEntry
    }

    func backToManufacturerSelection() {
        print("[CaptureFlowCoordinator] ⬅️ backToManufacturerSelection()")

        // IMPORTANT: View should have called scanner.cleanup() before this
        if !discoveredCameras.isEmpty {
            print("[CaptureFlowCoordinator]    Clearing \(discoveredCameras.count) camera references")
        }
        discoveredCameras = []
        selectedManufacturer = nil
        preferredSonyRecordID = nil

        state = .manufacturerSelection
        print("[CaptureFlowCoordinator]    ✓ State → .manufacturerSelection")
    }

    func updateDiscoveredCameras(_ cameras: [DiscoveredCamera]) {
        print("[CaptureFlowCoordinator] 📋 updateDiscoveredCameras() count=\(cameras.count)")
        discoveredCameras = cameras
    }

    func selectDiscoveredCamera(_ camera: DiscoveredCamera) {
        print("[CaptureFlowCoordinator] ═══════════════════════════════════════════")
        print("[CaptureFlowCoordinator] 📸 selectDiscoveredCamera: \(camera.name) @ \(camera.ipAddress)")
        print("[CaptureFlowCoordinator]    Total discovered: \(discoveredCameras.count)")

        // CRITICAL: This is the cross-stage cleanup logic - preserve exactly
        guard let session = camera.extractSession() else {
            print("[CaptureFlowCoordinator] ❌ No session in camera object!")
            state = .error("Camera session not ready. Please try scanning again.")
            return
        }

        guard session.connected else {
            print("[CaptureFlowCoordinator] ❌ Session exists but not connected!")
            state = .error("Camera disconnected. Please try scanning again.")
            return
        }

        print("[CaptureFlowCoordinator]    ✓ Session extracted, connected=true")

        // Create ActiveCamera with extracted session
        let activeCamera = ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )
        print("[CaptureFlowCoordinator]    ✓ ActiveCamera created")

        // Disconnect OTHER discovered cameras (not the selected one)
        let otherCameras = discoveredCameras.filter { $0.ipAddress != camera.ipAddress }
        if !otherCameras.isEmpty {
            print("[CaptureFlowCoordinator]    🔌 Disconnecting \(otherCameras.count) other camera(s)...")
            Task {
                for otherCamera in otherCameras {
                    print("[CaptureFlowCoordinator]       - \(otherCamera.name)")
                    await otherCamera.disconnect()
                }
                print("[CaptureFlowCoordinator]    ✓ Other cameras disconnected")
            }
        } else {
            print("[CaptureFlowCoordinator]    ✓ No other cameras to disconnect")
        }
        discoveredCameras = []

        // Start transfer session via global coordinator
        appCoordinator?.startTransferSession(with: activeCamera)
        state = .transferring
        print("[CaptureFlowCoordinator] ═══════════════════════════════════════════")
    }

    func showError(_ message: String) {
        state = .error(message)
    }

    /// Connect via manual IP address (delegates to AppCoordinator for PTP/IP session creation)
    func connectManualIP(_ ip: String) {
        print("[CaptureFlowCoordinator] Connecting to manual IP: \(ip)")
        state = .connecting(ip: ip)

        // Cancel any existing connection task
        connectionTask?.cancel()

        // Store new task for cancellation
        connectionTask = Task {
            do {
                let activeCamera = try await appCoordinator?.createManualSession(ip: ip)
                guard let activeCamera = activeCamera else {
                    state = .error("Failed to create camera session")
                    return
                }

                appCoordinator?.startTransferSession(with: activeCamera)
                state = .transferring
                connectionTask = nil  // Clear task on success
            } catch {
                print("[CaptureFlowCoordinator] Manual connection failed: \(error.localizedDescription)")
                state = .error(error.localizedDescription)
                connectionTask = nil  // Clear task on error
            }
        }
    }

    /// Cancel ongoing connection attempt
    func cancelConnection() {
        print("[CaptureFlowCoordinator] Cancelling connection...")
        connectionTask?.cancel()
        connectionTask = nil
    }

    // MARK: - Cleanup Registration

    /// Cleanup handler for current stage (registered by views)
    private var cleanupHandler: (() async -> Void)?

    /// Register cleanup for current stage
    /// Views call this in .onAppear to register their cleanup logic
    func registerCleanup(_ handler: @escaping () async -> Void) {
        cleanupHandler = handler
    }

    /// Unregister cleanup (call in .onDisappear)
    func unregisterCleanup() {
        cleanupHandler = nil
    }

    /// Execute registered cleanup
    /// Called by Close button and Back buttons before navigation
    func cleanup() async {
        if let handler = cleanupHandler {
            await handler()
            cleanupHandler = nil
        }
    }
}
