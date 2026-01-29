//
//  RootFlowView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-21
//

import SwiftUI
import Clerk

/// App entry gate for authentication.
///
/// Shows custom branded auth flow for unauthenticated users.
/// After successful auth, shows the main app shell (MainTabView).
struct RootFlowView: View {
    @Environment(\.clerk) private var clerk
    @EnvironmentObject var coordinator: AppCoordinator

    @State private var isInitializing = true

    var body: some View {
        ZStack {
            if isInitializing {
                LoadingView()
                    .transition(.opacity)
                    .zIndex(1)
            } else if clerk.user == nil {
                // Experimental: branded welcome + Clerk AuthView in sheet
                WelcomeWithClerkSheetView()
                    .transition(.opacity)
                    .zIndex(0)
            } else {
                MainTabView()
                    .transition(.opacity)
                    .zIndex(0)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: isInitializing)
        .animation(.easeInOut(duration: 0.3), value: clerk.user)
        .onReceive(coordinator.$appInitialized) { initialized in
            if initialized {
                isInitializing = false
            }
        }
    }
}
