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

    var body: some View {
        NavigationView {
            ZStack {
                // Background color
                Color(.systemBackground)
                    .ignoresSafeArea()

                // Content based on app state
                switch coordinator.appState {
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
                    WiFiSetupView()
                        .transition(.opacity)
                        .id("manual-ip-entry")

                case .connecting(let ip):
                    // Connecting view with IP display
                    ConnectingView(ipAddress: ip)
                        .transition(.opacity)
                        .id("connecting-\(ip)")

                case .transferring:
                    // Live capture view - pass session directly for proper observation
                    if let session = coordinator.transferSession {
                        LiveCaptureView(session: session) {
                            // Navigation callback - only change state, session.end() already called
                            coordinator.appState = .manufacturerSelection
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
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack)
        // Note: Disconnect alert is now local to LiveCaptureView (no global state needed)
    }
}

#Preview {
    let coordinator = AppCoordinator()
    return ContentView()
        .environmentObject(coordinator)
        .environmentObject(coordinator.connectionStore)
        .environmentObject(coordinator.photoStore)
}
