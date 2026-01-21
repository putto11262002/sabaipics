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
    /// IP address being connected to (passed from AppState.connecting)
    var ipAddress: String? = nil

    /// Legacy: connection store (for backward compatibility)
    @EnvironmentObject var connectionStore: ConnectionStore

    /// Display IP - prefer passed parameter, fall back to connectionStore
    private var displayIP: String {
        ipAddress ?? connectionStore.connectedIP ?? "..."
    }

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Animated spinner
            ProgressView()
                .scaleEffect(1.5)
                .progressViewStyle(CircularProgressViewStyle(tint: .blue))

            VStack(spacing: 8) {
                Text("Connecting to camera...")
                    .font(.title3)
                    .fontWeight(.medium)

                Text(displayIP)
                    .font(.body)
                    .foregroundColor(.secondary)

                if connectionStore.retryCount > 0 {
                    Text("Attempt \(connectionStore.retryCount + 1) of 3")
                        .font(.caption)
                        .foregroundColor(.orange)
                        .padding(.top, 8)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    let mockService = MockCameraService()
    let coordinator = AppCoordinator(cameraService: mockService)
    coordinator.connectionStore.connectedIP = "172.20.10.2"

    return ConnectingView(ipAddress: "172.20.10.2")
        .environmentObject(coordinator.connectionStore)
}

#Preview("Retrying") {
    let mockService = MockCameraService()
    let coordinator = AppCoordinator(cameraService: mockService)
    coordinator.connectionStore.connectedIP = "172.20.10.2"
    coordinator.connectionStore.retryCount = 1

    return ConnectingView()
        .environmentObject(coordinator.connectionStore)
}
