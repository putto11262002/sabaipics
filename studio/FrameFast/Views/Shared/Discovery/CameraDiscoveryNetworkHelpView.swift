//  CameraDiscoveryNetworkHelpView.swift
//  FrameFast
//
//  Pure UI view for camera discovery "network help" state.
//

import SwiftUI

struct CameraDiscoveryNetworkHelpView: View {
    let title: String
    let message: String
    let bullets: [String]
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.horizontal, 20)
            }

            if !bullets.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(bullets, id: \.self) { bullet in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•")
                                .foregroundColor(Color.Theme.mutedForeground)
                            Text(bullet)
                                .foregroundColor(Color.Theme.mutedForeground)
                        }
                        .font(.subheadline)
                    }
                }
                .padding(.top, 12)
                .padding(.horizontal, 20)
            }

            Spacer()

            Image(systemName: "wifi.slash")
                .font(.system(size: 48))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .center)

            Spacer()

            Button {
                onRetry()
            } label: {
                Text("Try Again")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
    }
}

#if DEBUG

#Preview("Network Help - Not Connected") {
    CameraDiscoveryNetworkHelpView(
        title: "No network connection",
        message: "Connect to WiFi to discover cameras.",
        bullets: [],
        onRetry: {}
    )
}

#Preview("Network Help - With Tips") {
    CameraDiscoveryNetworkHelpView(
        title: "Network issue",
        message: "Having trouble connecting? Try these steps:",
        bullets: [
            "Connect to the same WiFi network as your camera",
            "Make sure WiFi is enabled on your device",
            "Restart your router if needed"
        ],
        onRetry: {}
    )
}

#endif
