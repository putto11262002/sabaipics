//
//  ConnectionErrorView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Updated: 2026-01-19 - Transfer Session Architecture
//  Connection failed screen with "Try Again" button
//

import SwiftUI

/// Connection failed screen with "Try Again" button
struct ConnectionErrorView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    let errorMessage: String

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Error icon
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 60))
                .foregroundColor(Color.Theme.destructive)

            VStack(spacing: 8) {
                Text("Connection Failed")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(Color.Theme.foreground)

                Text(errorMessage)
                    .font(.body)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            // Try Again button - full reset back to manufacturer selection
            Button(action: {
                withAnimation {
                    captureFlow.backToManufacturerSelection()
                }
            }) {
                Text("Try Again")
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.Theme.background)
    }
}

#Preview("Connection Error") {
    let captureFlow = CaptureFlowCoordinator()
    captureFlow.state = .error("Unable to connect to camera. Please check that:\n\n• Camera WiFi is enabled\n• iPad is connected to camera's hotspot\n• IP address is correct")

    return ConnectionErrorView(
        errorMessage: "Unable to connect to camera. Please check that:\n\n• Camera WiFi is enabled\n• iPad is connected to camera's hotspot\n• IP address is correct"
    )
    .environmentObject(captureFlow)
    .preferredColorScheme(.light)
}

#Preview("Connection Error (Dark)") {
    let captureFlow = CaptureFlowCoordinator()
    captureFlow.state = .error("Connection timeout. Camera did not respond.")

    return ConnectionErrorView(
        errorMessage: "Connection timeout. Camera did not respond."
    )
    .environmentObject(captureFlow)
    .preferredColorScheme(.dark)
}
