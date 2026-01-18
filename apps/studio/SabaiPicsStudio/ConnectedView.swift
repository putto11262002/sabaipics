//
//  ConnectedView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Success celebration screen (auto-dismisses after 1.5 seconds)
//

import SwiftUI

/// Success celebration screen (auto-transitions via AppCoordinator)
struct ConnectedView: View {
    @EnvironmentObject var connectionStore: ConnectionStore

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Success checkmark animation
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.2))
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.green)
            }
            .transition(.scale.combined(with: .opacity))

            VStack(spacing: 8) {
                Text("Connected")
                    .font(.title)
                    .fontWeight(.bold)

                Text(connectionStore.cameraName)
                    .font(.headline)

                Text(connectionStore.connectedIP ?? "")
                    .font(.caption)
                    .foregroundColor(.secondary)
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
    coordinator.connectionStore.cameraName = "Canon EOS R5"

    return ConnectedView()
        .environmentObject(coordinator.connectionStore)
}
