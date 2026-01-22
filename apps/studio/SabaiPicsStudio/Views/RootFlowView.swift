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
/// Keeps the existing PTP flow (ContentView + AppCoordinator state machine) unchanged.
struct RootFlowView: View {
    @Environment(\.clerk) private var clerk

    var body: some View {
        Group {
            if clerk.user == nil {
                AuthView()
                    .ignoresSafeArea()
            } else {
                ContentView()
            }
        }
    }
}
