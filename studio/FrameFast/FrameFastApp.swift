//
//  FrameFastApp.swift
//  FrameFast
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI
import Clerk
import BackgroundTasks

@main
struct FrameFastApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var coordinator = AppCoordinator()
    @State private var clerk = Clerk.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        UIView.appearance().tintColor = UIColor(named: "AccentColor")
    }

    var body: some Scene {
        WindowGroup {
            RootFlowView()
                .environmentObject(coordinator)
                .environmentObject(coordinator.uploadStatusStore)
                .environmentObject(coordinator.connectivityStore)
                .environmentObject(coordinator.creditsStore)
                .environment(\.clerk, clerk)
                .tint(Color.accentColor)
                .task {
                    await configureAndLoadClerk()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        Task { try? await clerk.load() }
                        Task { await coordinator.uploadManager.resume() }
                        coordinator.uploadStatusStore.start()
                        if clerk.user != nil {
                            coordinator.creditsStore.start()
                        }
                    case .background:
                        coordinator.uploadStatusStore.stop()
                        coordinator.creditsStore.pause()
                        Task { await coordinator.scheduleBackgroundDrainIfNeeded() }
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
        }
    }

    private func configureAndLoadClerk() async {
        guard let publishableKey = Bundle.main.object(forInfoDictionaryKey: "ClerkPublishableKey") as? String,
              !publishableKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            assertionFailure("Missing Info.plist key 'ClerkPublishableKey'. Set via Xcode build settings (INFOPLIST_KEY_ClerkPublishableKey).")
            coordinator.appInitialized = true // Allow app to proceed even without Clerk
            return
        }

        clerk.configure(publishableKey: publishableKey)

        // Run clerk.load() and minimum 2-second timer in parallel
        async let clerkLoad: Void = {
            do {
                try await clerk.load()
            } catch {
                // Keep app usable even if session restore fails; user can sign in again.
                print("[Clerk] Failed to load session: \(error)")
            }
        }()

        async let minimumDelay: Void = {
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        }()

        // Wait for both to complete
        _ = await (clerkLoad, minimumDelay)

        // Mark initialization complete
        await MainActor.run {
            coordinator.appInitialized = true
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    @MainActor static weak var sharedBackgroundSession: BackgroundUploadSessionManager?
    @MainActor static weak var sharedCoordinator: AppCoordinator?
    private var bgDrainTask: Task<Void, Never>?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: AppCoordinator.bgDrainTaskIdentifier, using: nil) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handleUploadDrainTask(processingTask)
        }
        return true
    }

    private func handleUploadDrainTask(_ task: BGProcessingTask) {
        task.expirationHandler = { [weak self] in
            self?.bgDrainTask?.cancel()
            self?.bgDrainTask = nil
        }

        bgDrainTask = Task {
            let coordinator = await MainActor.run { AppDelegate.sharedCoordinator }
            if let coordinator {
                await coordinator.uploadManager.drainOnce()
                await coordinator.scheduleBackgroundDrainIfNeeded()
                task.setTaskCompleted(success: !Task.isCancelled)
                return
            }

            // BGProcessing relaunch path (no coordinator yet): build minimal dependencies.
            guard let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
                  let baseURLParsed = URL(string: baseURL) else {
                fatalError("APIBaseURL missing or malformed in Info.plist — check API_BASE_URL build setting")
            }
            let healthURL = baseURLParsed.appendingPathComponent("health")
            let connectivity = ConnectivityService(healthURL: healthURL)
            await connectivity.start()

            let bgSession = BackgroundUploadSessionManager.create()
            let uploadManager = UploadManager(baseURL: baseURL, connectivity: connectivity, backgroundSession: bgSession)

            await uploadManager.drainOnce()
            await scheduleBackgroundDrainIfNeeded(uploadManager: uploadManager)
            task.setTaskCompleted(success: !Task.isCancelled)
        }
    }

    private func scheduleBackgroundDrainIfNeeded(uploadManager: UploadManager) async {
        let s = await uploadManager.summary()
        guard s.inFlight > 0 else {
            print("[AppDelegate] No pending uploads, skipping background drain schedule")
            return
        }

        let request = BGProcessingTaskRequest(identifier: AppCoordinator.bgDrainTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[AppDelegate] Scheduled background drain (\(s.inFlight) pending)")
        } catch {
            print("[AppDelegate] Failed to schedule background drain: \(error)")
        }
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        guard identifier == BackgroundUploadSessionManager.sessionIdentifier else {
            completionHandler()
            return
        }

        // If the session manager is already initialized (app was already running),
        // wire the handler directly. Otherwise store it for init() to pick up.
        if let session = AppDelegate.sharedBackgroundSession {
            session.systemCompletionHandler = completionHandler
        } else {
            AppDelegate.pendingBackgroundCompletionHandler = completionHandler
        }
    }

    static var pendingBackgroundCompletionHandler: (() -> Void)?
}
