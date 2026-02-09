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
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "wifi.slash")
                .font(.system(size: 50))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

            VStack(spacing: 10) {
                Text(title)
                    .font(.title3)
                    .fontWeight(.medium)

                if !message.isEmpty {
                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                if !bullets.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(bullets, id: \.self) { bullet in
                            HStack(alignment: .top, spacing: 8) {
                                Text("-")
                                    .foregroundColor(Color.Theme.mutedForeground)
                                Text(bullet)
                                    .foregroundColor(Color.Theme.mutedForeground)
                            }
                            .font(.subheadline)
                        }
                    }
                    .padding(.horizontal, 40)
                }
            }

            Button("Try Again") {
                onRetry()
            }
            .buttonStyle(.compact)
            .padding(.top, 8)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
