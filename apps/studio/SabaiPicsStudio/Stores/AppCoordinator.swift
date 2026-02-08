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

    let uploadManager: UploadManager

    init() {
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.uploadManager = UploadManager(baseURL: baseURL)

        Task {
            await uploadManager.start()
        }
    }
}
