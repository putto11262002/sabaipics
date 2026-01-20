//
//  HotspotSetupView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  SAB-23: Hotspot setup instructions view
//
//  Shows instructions for setting up Personal Hotspot when not detected.
//  User must enable hotspot before proceeding to camera discovery.
//

import SwiftUI

/// View showing Personal Hotspot setup instructions
/// Displayed when hotspot is not detected before camera discovery
struct HotspotSetupView: View {
    @EnvironmentObject var coordinator: AppCoordinator

    /// Whether to show the back confirmation dialog
    @State private var showBackConfirmation = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // WiFi icon
            Image(systemName: "wifi.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.blue)

            // Title
            Text("Enable Personal Hotspot")
                .font(.title)
                .fontWeight(.bold)

            // Instructions
            VStack(alignment: .leading, spacing: 16) {
                HotspotInstructionRow(number: 1, text: "Open Settings app")
                HotspotInstructionRow(number: 2, text: "Tap \"Personal Hotspot\"")
                HotspotInstructionRow(number: 3, text: "Turn on \"Allow Others to Join\"")
                HotspotInstructionRow(number: 4, text: "Connect your camera to this hotspot")
            }
            .padding(.horizontal, 32)

            Spacer()

            // Next button
            Button(action: {
                coordinator.proceedToDiscovery()
            }) {
                Text("Next")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 40)

            // Skip button (for testing or manual IP entry)
            Button(action: {
                coordinator.skipToManualEntry()
            }) {
                Text("Enter IP Manually")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 20)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: {
                    showBackConfirmation = true
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                }
            }
        }
        .customConfirmationDialog(
            isPresented: $showBackConfirmation,
            title: "Go back?",
            message: "Return to manufacturer selection?",
            confirmLabel: "Go Back",
            isDestructive: false
        ) {
            coordinator.backToManufacturerSelection()
        }
    }
}

/// Single instruction row with number (Hotspot setup version)
struct HotspotInstructionRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Number circle
            Text("\(number)")
                .font(.headline)
                .foregroundColor(.white)
                .frame(width: 28, height: 28)
                .background(Color.accentColor)
                .clipShape(Circle())

            // Instruction text
            Text(text)
                .font(.body)
                .foregroundColor(.primary)

            Spacer()
        }
    }
}

// MARK: - Previews

#Preview("Hotspot Setup") {
    NavigationView {
        HotspotSetupView()
            .environmentObject(AppCoordinator())
    }
}
