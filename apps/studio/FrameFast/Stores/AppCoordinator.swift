//
//  AppCoordinator.swift
//  FrameFast
//
//  App-level coordinator holding initialization state.
//  Transfer sessions are owned by CaptureSessionStore (not here).
//

import SwiftUI
import BackgroundTasks

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
        let healthURL = URL(string: baseURL)!.appendingPathComponent("health")

        let connectivityService = ConnectivityService(healthURL: healthURL)
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

        // Make the background session manager accessible to AppDelegate so it can
        // wire background URLSession completion handlers while the app is running.
        AppDelegate.sharedBackgroundSession = bgSession

        // Make coordinator accessible to BGProcessing task handler.
        AppDelegate.sharedCoordinator = self

        Task {
            await uploadManager.start()
        }

        uploadStatusStore.start()
    }

    // MARK: - BGProcessingTask

    static let bgDrainTaskIdentifier = "com.framefast.upload-queue-drain"

    func scheduleBackgroundDrainIfNeeded() async {
        let s = await uploadManager.summary()
        guard s.inFlight > 0 else {
            print("[AppCoordinator] No pending uploads, skipping background drain schedule")
            return
        }

        let request = BGProcessingTaskRequest(identifier: Self.bgDrainTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[AppCoordinator] Scheduled background drain (\(s.inFlight) pending)")
        } catch {
            print("[AppCoordinator] Failed to schedule background drain: \(error)")
        }
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
