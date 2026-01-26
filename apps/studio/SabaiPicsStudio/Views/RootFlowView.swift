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

    var body: some View {
        Group {
            if clerk.user == nil {
                // Experimental: branded welcome + Clerk AuthView in sheet
                WelcomeWithClerkSheetView()
            } else {
                MainTabView()
            }
        }
    }
}
