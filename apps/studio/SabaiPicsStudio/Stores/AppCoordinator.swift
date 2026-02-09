//
//  AppCoordinator.swift
//  SabaiPicsStudio
//
//  App-level coordinator holding initialization state.
//  Transfer sessions are owned by CaptureSessionStore (not here).
//

import SwiftUI

@MainActor
class AppCoordinator: ObservableObject {

    /// Tracks if app initialization is complete (Clerk load + minimum 2s display)
    @Published var appInitialized = false

    /// Selected event destination for capture uploads.
    ///
    /// For now this is driven from the Events tab and persisted in UserDefaults.
    @Published private(set) var selectedEventId: String?

    let connectivityStore: ConnectivityStore
    let uploadManager: UploadManager
    let uploadStatusStore: UploadStatusStore

    private static let selectedEventDefaultsKey = "SelectedEventId"

    init() {
        self.selectedEventId = UserDefaults.standard.string(forKey: Self.selectedEventDefaultsKey)

        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"

        let connectivityService = ConnectivityService()
        self.connectivityStore = ConnectivityStore(service: connectivityService)
        self.uploadManager = UploadManager(baseURL: baseURL, connectivity: connectivityService)
        self.uploadStatusStore = UploadStatusStore(uploadManager: uploadManager)

        connectivityStore.start()

        Task {
            await uploadManager.start()
        }

        uploadStatusStore.start()
    }

    func selectEvent(id: String?) {
        selectedEventId = id

        if let id {
            UserDefaults.standard.set(id, forKey: Self.selectedEventDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.selectedEventDefaultsKey)
        }
    }
}
