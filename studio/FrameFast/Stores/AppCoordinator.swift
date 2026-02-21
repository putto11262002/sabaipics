//
//  AppCoordinator.swift
//  FrameFast
//
//  App-level coordinator holding initialization state.
//  Transfer sessions are owned by CaptureSessionStore (not here).
//

import SwiftUI
import BackgroundTasks
import Clerk
import Combine

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
    let creditsStore: CreditsStore
    let uploadManager: UploadManager
    let uploadStatusStore: UploadStatusStore
    let backgroundSession: BackgroundUploadSessionManager

    private static let selectedEventDefaultsKey = "SelectedEventId"
    private static let selectedEventNameDefaultsKey = "SelectedEventName"
    private var connectivityCancellable: AnyCancellable?

    init() {
        self.selectedEventId = UserDefaults.standard.string(forKey: Self.selectedEventDefaultsKey)
        self.selectedEventName = UserDefaults.standard.string(forKey: Self.selectedEventNameDefaultsKey)

        guard let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
              let baseURLParsed = URL(string: baseURL) else {
            fatalError("APIBaseURL missing or malformed in Info.plist — check API_BASE_URL build setting")
        }
        let healthURL = baseURLParsed.appendingPathComponent("health")

        let connectivityService = ConnectivityService(healthURL: healthURL)
        let dashboardClient = DashboardAPIClient(baseURL: baseURL)
        let bgSession = BackgroundUploadSessionManager.create()
        self.connectivityStore = ConnectivityStore(service: connectivityService)
        self.creditsStore = CreditsStore(apiClient: dashboardClient, connectivityStore: connectivityStore)
        self.backgroundSession = bgSession
        self.uploadManager = UploadManager(baseURL: baseURL, connectivity: connectivityService, backgroundSession: bgSession)
        self.uploadStatusStore = UploadStatusStore(uploadManager: uploadManager)

        connectivityStore.start()
        observeConnectivityForAuthRefresh()

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

    // MARK: - Auth Helpers

    func forceSignOut() {
        Task {
            // Wipe cached data before sign-out for security.
            await DiskCache(directoryName: "FrameFastCache").deleteAll()

            do {
                try await Clerk.shared.signOut()
            } catch {
                // Session already revoked server-side — signOut() fails because
                // it also hits a 401. Re-sync local state so clerk.user clears.
                print("[AppCoordinator] Sign-out failed: \(error), refreshing Clerk state")
                try? await Clerk.shared.load()
            }
        }
    }

    private func observeConnectivityForAuthRefresh() {
        var previousStatus = connectivityStore.state.status
        connectivityCancellable = connectivityStore.$state
            .sink { [weak self] newState in
                guard self != nil else { return }
                let newStatus = newState.status
                defer { previousStatus = newStatus }
                guard previousStatus == .offline, newStatus == .online else { return }
                print("[AppCoordinator] Connectivity restored, refreshing Clerk session")
                Task { try? await Clerk.shared.load() }
            }
    }

    // MARK: - Event Selection

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
