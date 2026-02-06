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
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // CHANGED

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // WiFi icon
            Image(systemName: "wifi.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(Color.Theme.primary)

            // Title
            Text("Enable Personal Hotspot")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Color.Theme.foreground)

            // Instructions
            VStack(alignment: .leading, spacing: 16) {
                HotspotInstructionRow(
                    number: 1,
                    parts: [
                        .muted("Open "),
                        .prominent("Settings"),
                        .muted(" app")
                    ]
                )
                HotspotInstructionRow(
                    number: 2,
                    parts: [
                        .muted("Tap "),
                        .prominent("Personal Hotspot")
                    ]
                )
                HotspotInstructionRow(
                    number: 3,
                    parts: [
                        .muted("Turn on "),
                        .prominent("Allow Others to Join")
                    ]
                )
                HotspotInstructionRow(
                    number: 4,
                    parts: [
                        .muted("Connect your "),
                        .prominent("camera"),
                        .muted(" to this hotspot")
                    ]
                )
            }
            .padding(.horizontal, 32)

            Spacer()

            // Next button
            Button("Next") {
                captureFlow.proceedToDiscovery()
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 40)
            .padding(.bottom, 40)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .appBackButton(
            confirmation: AppBackConfirmation(
                title: "Go back?",
                message: "Return to manufacturer selection?"
            )
        ) {
            captureFlow.backToManufacturerSelection()
        }
    }
}

/// Single instruction row with number (Hotspot setup version)
struct HotspotInstructionRow: View {
    enum TextPart {
        case muted(String)
        case prominent(String)
    }

    let number: Int
    let parts: [TextPart]

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Number with period
            Text("\(number).")
                .font(.body)
                .foregroundColor(Color.Theme.mutedForeground)

            // Instruction text with mixed emphasis
            buildInstructionText()
                .font(.body)

            Spacer()
        }
    }

    private func buildInstructionText() -> Text {
        var result = Text("")
        for part in parts {
            switch part {
            case .muted(let str):
                result = result + Text(str).foregroundColor(Color.Theme.mutedForeground)
            case .prominent(let str):
                result = result + Text(str).foregroundColor(Color.Theme.foreground)
            }
        }
        return result
    }
}

// MARK: - Previews

#Preview("Hotspot Setup") {
    NavigationView {
        HotspotSetupView()
            .environmentObject(AppCoordinator())
    }
}
