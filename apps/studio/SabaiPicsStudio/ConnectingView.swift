//
//  ConnectingView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Updated: 2026-01-19 - Transfer Session Architecture
//  Premium searching/connecting screen with animated spinner
//

import SwiftUI

/// Searching/connecting screen with animated spinner
struct ConnectingView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator

    /// IP address being connected to (not displayed to user)
    var ipAddress: String? = nil

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Animated spinner
            ProgressView()
                .scaleEffect(1.5)
                .tint(Color.Theme.primary)

            Text("Connecting...")
                .font(.title3)
                .fontWeight(.medium)
                .foregroundColor(Color.Theme.foreground)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.Theme.background)
        .onAppear {
            print("[ConnectingView] View appeared, registering cleanup")

            // Register cleanup to cancel connection if user closes
            captureFlow.registerCleanup { [weak captureFlow] in
                print("[ConnectingView] Running registered cleanup (cancel connection)")
                captureFlow?.cancelConnection()
            }
        }
        .onDisappear {
            captureFlow.unregisterCleanup()
        }
    }
}

#Preview("Connecting to Camera") {
    ConnectingView(ipAddress: "172.20.10.2")
        .environmentObject(CaptureFlowCoordinator())
        .preferredColorScheme(.light)
}

#Preview("Connecting (Dark Mode)") {
    ConnectingView(ipAddress: "192.168.1.1")
        .environmentObject(CaptureFlowCoordinator())
        .preferredColorScheme(.dark)
}
