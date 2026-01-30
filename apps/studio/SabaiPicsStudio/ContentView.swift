//
//  ContentView.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//  Updated: 2026-01-19 - Transfer Session Architecture
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var coordinator: AppCoordinator
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // NEW

    var body: some View {
        ZStack {
            // Background color
            Color(.systemBackground)
                .ignoresSafeArea()

            // Content based on capture flow state (CHANGED)
            switch captureFlow.state {
            case .manufacturerSelection:
                ManufacturerSelectionView()
                    .transition(.opacity)
                    .id("manufacturer-selection")

            case .hotspotSetup:
                HotspotSetupView()
                    .transition(.opacity)
                    .id("hotspot-setup")

            case .discovering:
                CameraDiscoveryView()
                    .transition(.opacity)
                    .id("camera-discovery")

            case .manualIPEntry:
                // Manual IP entry (fallback from discovery)
                ManualIPEntryView()
                    .transition(.opacity)
                    .id("manual-ip-entry")

            case .connecting(let ip):
                // Connecting view with IP display
                ConnectingView(ipAddress: ip)
                    .transition(.opacity)
                    .id("connecting-\(ip)")

            case .transferring:
                // IMPORTANT: Keep coordinator.transferSession reference (global state)
                if let session = coordinator.transferSession {
                    LiveCaptureView(session: session) {
                        // Navigation callback
                        captureFlow.state = .manufacturerSelection
                        coordinator.transferSession = nil
                    }
                    .transition(.opacity)
                    .id("transferring")
                }

            case .error(let message):
                ConnectionErrorView(errorMessage: message)
                    .transition(.opacity)
                    .id("error")
            }
        }
    }
}

#Preview {
    let coordinator = AppCoordinator()
    return ContentView()
        .environmentObject(coordinator)
        .environmentObject(coordinator.connectionStore)
        .environmentObject(coordinator.photoStore)
}
