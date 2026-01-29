//
//  SabaiPicsStudioApp.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI
import Clerk

@main
struct SabaiPicsStudioApp: App {
    @StateObject private var coordinator = AppCoordinator()
    @State private var clerk = Clerk.shared

    var body: some Scene {
        WindowGroup {
            RootFlowView()
                .environmentObject(coordinator)
                .environmentObject(coordinator.connectionStore)
                .environmentObject(coordinator.photoStore)
                .environment(\.clerk, clerk)
                .tint(Color.Theme.primary)
                .task {
                    await configureAndLoadClerk()
                }
        }
    }

    private func configureAndLoadClerk() async {
        guard let publishableKey = Bundle.main.object(forInfoDictionaryKey: "ClerkPublishableKey") as? String,
              !publishableKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            assertionFailure("Missing Info.plist key 'ClerkPublishableKey'. Set via Xcode build settings (INFOPLIST_KEY_ClerkPublishableKey).")
            return
        }

        clerk.configure(publishableKey: publishableKey)

        do {
            try await clerk.load()
        } catch {
            // Keep app usable even if session restore fails; user can sign in again.
            print("[Clerk] Failed to load session: \(error)")
        }
    }
}
