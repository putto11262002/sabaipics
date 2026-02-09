//
//  AppCoordinator.swift
//  FrameFast
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
    @Published private(set) var selectedEventName: String?

    let connectivityStore: ConnectivityStore
    let uploadManager: UploadManager
    let uploadStatusStore: UploadStatusStore
    let backgroundSession: BackgroundUploadSessionManager

    private static let selectedEventDefaultsKey = "SelectedEventId"
    private static let selectedEventNameDefaultsKey = "SelectedEventName"

    init() {
        self.selectedEventId = UserDefaults.standard.string(forKey: Self.selectedEventDefaultsKey)
        self.selectedEventName = UserDefaults.standard.string(forKey: Self.selectedEventNameDefaultsKey)

        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"

        let connectivityService = ConnectivityService()
        let bgSession = BackgroundUploadSessionManager.create()
        self.connectivityStore = ConnectivityStore(service: connectivityService)
        self.backgroundSession = bgSession
        self.uploadManager = UploadManager(baseURL: baseURL, connectivity: connectivityService, backgroundSession: bgSession)
        self.uploadStatusStore = UploadStatusStore(uploadManager: uploadManager)

        connectivityStore.start()

        // Wire any pending background session completion handler from a system relaunch.
        if let pending = AppDelegate.pendingBackgroundCompletionHandler {
            bgSession.systemCompletionHandler = pending
            AppDelegate.pendingBackgroundCompletionHandler = nil
        }

        Task {
            await uploadManager.start()
        }

        uploadStatusStore.start()
    }

    func selectEvent(id: String?, name: String?) {
        selectedEventId = id
        selectedEventName = name

        if let id {
            UserDefaults.standard.set(id, forKey: Self.selectedEventDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.selectedEventDefaultsKey)
        }

        if let name {
            UserDefaults.standard.set(name, forKey: Self.selectedEventNameDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.selectedEventNameDefaultsKey)
        }
    }
}
