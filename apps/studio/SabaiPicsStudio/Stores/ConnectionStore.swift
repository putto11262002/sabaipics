//
//  ConnectionStore.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 2: Architecture Refactoring - Connection Store
//
//  Focused on connection state management only.
//  Extracted from CameraViewModel god object.
//

import Foundation
import Combine
import SwiftUI

/// Store managing camera connection state and related UI concerns
/// - Subscribes to CameraServiceProtocol publishers
/// - Manages connection lifecycle (connect, disconnect, retry)
/// - Handles permission checks and retry logic
class ConnectionStore: ObservableObject {
    // MARK: - Published State

    /// Current connection state (idle -> connecting -> connected/error)
    @Published var connectionState: ConnectionState = .idle

    /// IP address of currently connected camera (or connection attempt)
    @Published var connectedIP: String?

    /// Camera name for display in UI
    @Published var cameraName: String = "Canon EOS R5"

    /// Event/session name for display in UI
    @Published var eventName: String = "Event Session"

    /// Current retry attempt count (for connection retry UX)
    @Published var retryCount: Int = 0

    /// Connection error message (nil if no error)
    @Published var connectionError: String?

    /// Whether permission check is in progress (local network permission)
    @Published var isCheckingPermission: Bool = false

    /// Flag to trigger connected screen dismissal (for auto-transition)
    @Published var shouldDismissConnected: Bool = false

    // MARK: - Dependencies

    /// Camera service (injected via protocol for testability)
    private let cameraService: any CameraServiceProtocol

    /// Combine subscriptions storage
    private var cancellables = Set<AnyCancellable>()

    /// Start time of connection attempt (for minimum display duration)
    private var connectingStartTime: Date?

    /// UserDefaults key for last connected IP
    private let lastIPKey = "LastCameraIP"

    /// Flag to track intentional disconnect (prevents treating it as error)
    private var isIntentionalDisconnect: Bool = false

    // MARK: - Initialization

    /// Initialize connection store with camera service
    /// - Parameter cameraService: Service conforming to CameraServiceProtocol
    @MainActor
    init(cameraService: any CameraServiceProtocol) {
        self.cameraService = cameraService
        setupSubscriptions()
    }

    // MARK: - Public Actions

    /// Connect to WiFi camera with specified IP address
    /// Includes pre-flight permission check if needed
    /// - Parameter ip: Camera IP address (e.g., "192.168.1.1")
    func connect(ip: String) {
        print("[ConnectionStore] Starting WiFi connection flow...")
        connectedIP = ip

        // Save last IP for quick reconnect
        UserDefaults.standard.set(ip, forKey: lastIPKey)

        // Check if we likely have permission already
        if LocalNetworkPermissionChecker.likelyHasPermission() {
            // Skip pre-flight, connect directly
            print("[ConnectionStore] Permission already granted, connecting...")
            initiateConnection(ip: ip)
            return
        }

        // First time or permission unclear - do pre-flight check
        print("[ConnectionStore] Triggering local network permission check...")
        isCheckingPermission = true
        connectionState = .connecting  // Show ConnectingView

        LocalNetworkPermissionChecker.triggerPermissionPrompt { [weak self] in
            DispatchQueue.main.async {
                self?.isCheckingPermission = false
                print("[ConnectionStore] Permission check complete, connecting...")
                self?.initiateConnection(ip: ip)
            }
        }
    }

    /// Disconnect from camera and reset all connection state
    func disconnect() {
        print("[ConnectionStore] Disconnecting from camera")

        // Mark as intentional disconnect to prevent error state
        isIntentionalDisconnect = true

        // Cancel any pending connection attempts
        cameraService.cancelRetry()

        // Disconnect from camera on background thread to avoid blocking
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self = self else { return }

            self.cameraService.disconnect()

            await MainActor.run {
                // Reset ALL connection state to clean slate
                self.isCheckingPermission = false
                self.shouldDismissConnected = false
                self.retryCount = 0
                self.connectingStartTime = nil
                self.connectedIP = nil
                self.connectionError = nil

                // Return to idle state (waiting for connection) with animation
                withAnimation(.easeInOut) {
                    self.connectionState = .idle
                }

                // Reset disconnect flag
                self.isIntentionalDisconnect = false

                print("[ConnectionStore] Returned to idle state")
            }
        }
    }

    /// Cancel any pending connection attempt
    func cancelConnection() {
        print("[ConnectionStore] Cancelling connection attempt")
        cameraService.cancelConnection()
        connectionState = .idle
        connectingStartTime = nil
        retryCount = 0
    }

    /// Get the last connected camera IP address
    /// - Returns: IP address string or nil if none saved
    func getLastConnectedIP() -> String? {
        return UserDefaults.standard.string(forKey: lastIPKey)
    }

    // MARK: - Private Methods

    /// Initiate connection to camera (after permission check)
    private func initiateConnection(ip: String) {
        print("[ConnectionStore] Initiating connection to \(ip)")

        // Show connecting state and track start time
        connectionState = .connecting
        connectingStartTime = Date()

        // Use retry-enabled connection
        cameraService.connectWithRetry(ip: ip)
    }

    /// Setup Combine subscriptions to service publishers
    /// Note: We subscribe by directly accessing the concrete service type
    /// This is necessary because protocols can't expose @Published property wrappers
    @MainActor
    private func setupSubscriptions() {
        print("[ConnectionStore] Setting up service subscriptions")

        // Subscribe using concrete type (WiFiCameraService or MockCameraService)
        // Both expose @Published properties that we can observe
        if let wifiService = cameraService as? WiFiCameraService {
            subscribeToWiFiService(wifiService)
        } else if let mockService = cameraService as? MockCameraService {
            subscribeToMockService(mockService)
        } else {
            print("[ConnectionStore] Unknown service type, subscriptions not set up")
        }
    }

    /// Subscribe to WiFiCameraService publishers
    @MainActor
    private func subscribeToWiFiService(_ service: WiFiCameraService) {
        // Subscribe to connection state
        service.$isConnected
            .sink { [weak self] isConnected in
                guard let self = self else { return }
                if isConnected {
                    self.handleSuccessfulConnection()
                } else if case .connected = self.connectionState {
                    // Only treat as error if NOT an intentional disconnect
                    if !self.isIntentionalDisconnect {
                        print("[ConnectionStore] Unexpected disconnect detected")
                        self.connectionState = .error("Camera disconnected. Check WiFi connection and reconnect.")
                        self.connectingStartTime = nil
                    } else {
                        print("[ConnectionStore] Intentional disconnect, skipping error state")
                    }
                }
            }
            .store(in: &cancellables)

        // Subscribe to connection errors
        service.$connectionError
            .compactMap { $0 } // Filter out nil values
            .sink { [weak self] error in
                self?.handleConnectionError(error)
            }
            .store(in: &cancellables)

        // Subscribe to retry count
        service.$currentRetryCount
            .assign(to: &$retryCount)
    }

    /// Subscribe to MockCameraService publishers
    private func subscribeToMockService(_ service: MockCameraService) {
        // Subscribe to connection state
        service.$isConnected
            .sink { [weak self] isConnected in
                guard let self = self else { return }
                if isConnected {
                    self.handleSuccessfulConnection()
                } else if case .connected = self.connectionState {
                    // Only treat as error if NOT an intentional disconnect
                    if !self.isIntentionalDisconnect {
                        print("[ConnectionStore] Unexpected disconnect detected")
                        self.connectionState = .error("Camera disconnected. Check WiFi connection and reconnect.")
                        self.connectingStartTime = nil
                    } else {
                        print("[ConnectionStore] Intentional disconnect, skipping error state")
                    }
                }
            }
            .store(in: &cancellables)

        // Subscribe to connection errors
        service.$connectionError
            .compactMap { $0 }
            .sink { [weak self] error in
                self?.handleConnectionError(error)
            }
            .store(in: &cancellables)

        // Subscribe to retry count
        service.$currentRetryCount
            .assign(to: &$retryCount)
    }

    /// Handle successful connection with minimum display time
    private func handleSuccessfulConnection() {
        print("[ConnectionStore] WiFi connected, showing success...")

        // Calculate elapsed time since connecting started
        let elapsed = connectingStartTime.map { Date().timeIntervalSince($0) } ?? 0
        let minimumDisplay: TimeInterval = 1.5
        let remainingDelay = max(0, minimumDisplay - elapsed)

        // Wait remaining time to ensure minimum display duration
        Task { @MainActor in
            if remainingDelay > 0 {
                print("[ConnectionStore] Waiting \(remainingDelay)s for minimum display time...")
                try? await Task.sleep(nanoseconds: UInt64(remainingDelay * 1_000_000_000))
            }

            // Show success celebration
            self.connectionState = .connected
            self.shouldDismissConnected = false
            self.connectionError = nil

            // Note: Auto-transition to capturing happens at app level (AppState)
            // This store only manages connection state
        }
    }

    /// Handle connection error
    private func handleConnectionError(_ error: String) {
        print("[ConnectionStore] WiFi connection error: \(error)")
        connectionState = .error(error)
        connectionError = error
        connectingStartTime = nil
    }
}

// MARK: - Example Usage

/*
 Example 1: Real camera

 ```swift
 let service = WiFiCameraService()
 let connectionStore = ConnectionStore(cameraService: service)

 // Connect
 connectionStore.connect(ip: "192.168.1.1")

 // Disconnect
 connectionStore.disconnect()
 ```

 Example 2: Mock camera (for testing/previews)

 ```swift
 let mockService = MockCameraService()
 let connectionStore = ConnectionStore(cameraService: mockService)

 // Simulate connection
 mockService.simulateConnection(success: true)
 // connectionStore.connectionState == .connected

 // Simulate error
 mockService.simulateConnection(success: false)
 // connectionStore.connectionState == .error(...)
 ```

 Example 3: SwiftUI Environment Injection (Phase 4)

 ```swift
 // App root
 ContentView()
     .environmentObject(connectionStore)

 // Any child view
 struct WiFiSetupView: View {
     @EnvironmentObject var connectionStore: ConnectionStore

     var body: some View {
         Button("Connect") {
             connectionStore.connect(ip: "192.168.1.1")
         }
     }
 }
 ```
 */
