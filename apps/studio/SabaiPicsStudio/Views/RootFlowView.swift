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
        Group {
            if isInitializing {
                LoadingView()
            } else if clerk.user == nil {
                // Experimental: branded welcome + Clerk AuthView in sheet
                WelcomeWithClerkSheetView()
            } else {
                MainTabView()
            }
        }
        .onReceive(coordinator.$appInitialized) { initialized in
            if initialized {
                isInitializing = false
            }
        }
    }
}
