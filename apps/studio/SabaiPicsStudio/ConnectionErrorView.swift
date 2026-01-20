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
    @EnvironmentObject var coordinator: AppCoordinator
    let errorMessage: String

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Error icon
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 60))
                .foregroundColor(.red)

            VStack(spacing: 8) {
                Text("Connection Failed")
                    .font(.title2)
                    .fontWeight(.bold)

                Text(errorMessage)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            // Try Again button - returns to manufacturer selection
            Button(action: {
                withAnimation {
                    coordinator.backToManufacturerSelection()
                }
            }) {
                Text("Try Again")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    let coordinator = AppCoordinator()
    coordinator.appState = .error("Connection failed after 3 attempts. Please check camera WiFi settings.")

    return ConnectionErrorView(
        errorMessage: "Connection failed after 3 attempts. Please check camera WiFi settings."
    )
    .environmentObject(coordinator)
}
