//
//  AppCoordinator.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 3: Architecture Refactoring - App Coordinator
//
//  Wires together ConnectionStore and PhotoStore at the app root level.
//  Manages app-level state coordination and service initialization.
//

import SwiftUI
import Combine

/// App-level coordinator that wires together stores and manages app state
///
/// Responsibilities:
/// - Creates and owns the camera service (WiFiCameraService or MockCameraService)
/// - Creates both ConnectionStore and PhotoStore with shared service instance
/// - Maps ConnectionState → AppState for top-level view routing
/// - Handles app-level state transitions (e.g., connected → capturing)
/// - Provides stores via @EnvironmentObject in SwiftUI
///
/// Usage:
/// ```swift
/// // Production (real camera)
/// let coordinator = AppCoordinator()
/// ContentView()
///     .environmentObject(coordinator)
///     .environmentObject(coordinator.connectionStore)
///     .environmentObject(coordinator.photoStore)
///
/// // Testing (mock camera)
/// let mockService = MockCameraService()
/// let testCoordinator = AppCoordinator(cameraService: mockService)
/// ```
class AppCoordinator: ObservableObject {

    // MARK: - App State

    /// Current app state (determines which view to show in ContentView)
    /// AppState enum is defined in Models/AppState.swift
    @Published var appState: AppState = .idle

    /// Disconnect confirmation alert state (app-level to prevent orphaned overlays)
    @Published var showDisconnectAlert: Bool = false

    // MARK: - Stores (injected into environment)

    /// Connection store (manages connection state and lifecycle)
    let connectionStore: ConnectionStore

    /// Photo store (manages photo collection)
    let photoStore: PhotoStore

    // MARK: - Service

    /// Camera service (shared instance for both stores)
    private let cameraService: any CameraServiceProtocol

    /// Combine subscriptions storage
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initializers

    /// Initialize with real WiFi camera service (production)
    /// This is the default initializer used in production builds
    init() {
        let service = WiFiCameraService()
        self.cameraService = service
        self.connectionStore = ConnectionStore(cameraService: service)
        self.photoStore = PhotoStore(cameraService: service)

        setupSubscriptions()
        print("[AppCoordinator] Initialized with WiFiCameraService")
    }

    /// Initialize with custom service (for testing/mocking)
    /// Use this in tests and previews to inject a MockCameraService
    /// - Parameter cameraService: Service conforming to CameraServiceProtocol
    init(cameraService: any CameraServiceProtocol) {
        self.cameraService = cameraService
        self.connectionStore = ConnectionStore(cameraService: cameraService)
        self.photoStore = PhotoStore(cameraService: cameraService)

        setupSubscriptions()
        print("[AppCoordinator] Initialized with custom service: \(type(of: cameraService))")
    }

    // MARK: - State Management

    /// Setup Combine subscriptions to map ConnectionState → AppState
    /// This is the core coordination logic that drives top-level routing
    private func setupSubscriptions() {
        print("[AppCoordinator] Setting up state subscriptions")

        // Subscribe to connectionStore.connectionState
        // Map ConnectionState to AppState for top-level view routing
        connectionStore.$connectionState
            .sink { [weak self] connectionState in
                self?.updateAppState(for: connectionState)
            }
            .store(in: &cancellables)
    }

    /// Map ConnectionState to AppState
    /// Handles state transitions and timing logic
    /// - Parameter connectionState: Current connection state from ConnectionStore
    private func updateAppState(for connectionState: ConnectionState) {
        switch connectionState {
        case .idle:
            // User hasn't connected yet (WiFiSetupView)
            appState = .idle
            print("[AppCoordinator] AppState: idle")

        case .connecting:
            // Connection in progress (ConnectingView with retry status)
            appState = .connecting
            print("[AppCoordinator] AppState: connecting")

        case .connected:
            // Successfully connected - show celebration, then auto-transition
            appState = .connected
            print("[AppCoordinator] AppState: connected (celebrating...)")

            // After 1.5s connected celebration, move to capturing
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self = self else { return }

                // Only transition if we're still in connected state
                // (user might have disconnected during celebration)
                if case .connected = self.appState {
                    self.appState = .capturing
                    print("[AppCoordinator] AppState: capturing (ready to shoot)")
                }
            }

        case .error(let message):
            // Connection error (ConnectionErrorView)
            appState = .error(message)
            print("[AppCoordinator] AppState: error - \(message)")
        }
    }

    // MARK: - Public Actions

    /// Request disconnect (shows confirmation alert)
    /// Called by LiveCaptureView when user taps "Disconnect" button
    func requestDisconnect() {
        print("[AppCoordinator] Disconnect requested, showing alert")
        showDisconnectAlert = true
    }

    /// Confirm disconnect (called when user confirms in alert)
    /// Performs the actual disconnect and clears photos
    func confirmDisconnect() {
        print("[AppCoordinator] Disconnect confirmed, disconnecting...")
        connectionStore.disconnect()
        photoStore.clearPhotos()
    }
}

// MARK: - Example Usage

/*
 Example 1: Production usage (real camera)

 ```swift
 // In App entry point (SabaiPicsStudioApp.swift)
 @main
 struct SabaiPicsStudioApp: App {
     @StateObject private var coordinator = AppCoordinator()

     var body: some Scene {
         WindowGroup {
             ContentView()
                 .environmentObject(coordinator)
                 .environmentObject(coordinator.connectionStore)
                 .environmentObject(coordinator.photoStore)
         }
     }
 }

 // In ContentView
 struct ContentView: View {
     @EnvironmentObject var coordinator: AppCoordinator

     var body: some View {
         switch coordinator.appState {
         case .idle:
             WiFiSetupView()
         case .connecting:
             ConnectingView()
         case .connected:
             ConnectedView()
         case .capturing:
             LiveCaptureView()
         case .error(let message):
             ConnectionErrorView(message: message)
         default:
             EmptyView()
         }
     }
 }
 ```

 Example 2: Testing with mock service

 ```swift
 // In unit tests
 func testConnectionFlow() {
     let mockService = MockCameraService()
     let coordinator = AppCoordinator(cameraService: mockService)

     // Start idle
     XCTAssertEqual(coordinator.appState, .idle)

     // Simulate connection
     mockService.simulateConnection(success: true)

     // Should be connected, then auto-transition to capturing
     XCTAssertEqual(coordinator.appState, .connected)

     // Wait for auto-transition
     let expectation = XCTestExpectation(description: "Auto-transition to capturing")
     DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
         XCTAssertEqual(coordinator.appState, .capturing)
         expectation.fulfill()
     }
     wait(for: [expectation], timeout: 3.0)
 }
 ```

 Example 3: SwiftUI preview with mock data

 ```swift
 #Preview("Connected State") {
     let mockService = MockCameraService()
     let coordinator = AppCoordinator(cameraService: mockService)

     // Simulate connected state
     mockService.simulateConnection(success: true)

     return ContentView()
         .environmentObject(coordinator)
         .environmentObject(coordinator.connectionStore)
         .environmentObject(coordinator.photoStore)
 }

 #Preview("Error State") {
     let mockService = MockCameraService()
     let coordinator = AppCoordinator(cameraService: mockService)

     // Simulate error
     mockService.simulateConnection(success: false)

     return ContentView()
         .environmentObject(coordinator)
         .environmentObject(coordinator.connectionStore)
         .environmentObject(coordinator.photoStore)
 }
 ```

 Example 4: Coordinated disconnect (clears both connection and photos)

 ```swift
 struct DisconnectButton: View {
     @EnvironmentObject var connectionStore: ConnectionStore
     @EnvironmentObject var photoStore: PhotoStore

     var body: some View {
         Button("Disconnect") {
             // Disconnect from camera
             connectionStore.disconnect()

             // Clear photos
             photoStore.clearPhotos()

             // AppCoordinator will automatically update appState to .idle
         }
     }
 }
 ```
 */
