//
//  FrameFastApp.swift
//  FrameFast
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI
import Clerk

@main
struct FrameFastApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var coordinator = AppCoordinator()
    @State private var clerk = Clerk.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootFlowView()
                .environmentObject(coordinator)
                .environmentObject(coordinator.uploadStatusStore)
                .environmentObject(coordinator.connectivityStore)
                .environment(\.clerk, clerk)
                .tint(Color.Theme.primary)
                .task {
                    await configureAndLoadClerk()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        Task { await coordinator.uploadManager.resume() }
                        coordinator.uploadStatusStore.start()
                    case .background:
                        coordinator.uploadStatusStore.stop()
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
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        guard identifier == BackgroundUploadSessionManager.sessionIdentifier else {
            completionHandler()
            return
        }
        // The background session manager is recreated on launch via AppCoordinator.
        // Store the handler; it will be called by BackgroundUploadSessionManager.urlSessionDidFinishEvents.
        AppDelegate.pendingBackgroundCompletionHandler = completionHandler
    }

    static var pendingBackgroundCompletionHandler: (() -> Void)?
}
