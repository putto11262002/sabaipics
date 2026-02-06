//
//  AppCoordinator.swift
//  SabaiPicsStudio
//
//  App-level coordinator holding shared stores and initialization state.
//  Transfer sessions are owned by CaptureSessionStore (not here).
//

import SwiftUI

@MainActor
class AppCoordinator: ObservableObject {

    // MARK: - App State

    /// Tracks if app initialization is complete (Clerk load + minimum 2s display)
    @Published var appInitialized = false

    // MARK: - Legacy Stores

    let connectionStore: ConnectionStore
    let photoStore: PhotoStore

    // MARK: - Initializers

    init() {
        let service = WiFiCameraService()
        self.connectionStore = ConnectionStore(cameraService: service)
        self.photoStore = PhotoStore(cameraService: service)
    }

    init(cameraService: any CameraServiceProtocol) {
        self.connectionStore = ConnectionStore(cameraService: cameraService)
        self.photoStore = PhotoStore(cameraService: cameraService)
    }
}
