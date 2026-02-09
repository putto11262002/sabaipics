//  CameraDiscoveryNotFoundView.swift
//  FrameFast
//
//  Pure UI view for camera discovery "not found" state.
//

import SwiftUI

struct CameraDiscoveryNotFoundView: View {
    let title: String
    let message: String
    let bullets: [String]
    let iconSystemName: String?
    let showsManualIP: Bool
    let onRetry: () -> Void
    let onManualIP: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            if let icon = iconSystemName {
                Image(systemName: icon)
                    .font(.system(size: 50))
                    .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))
            }

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

            VStack(spacing: 10) {
                Button("Try Again") {
                    onRetry()
                }
                .buttonStyle(.compact)

                if showsManualIP {
                    Button("Enter IP Manually") {
                        onManualIP()
                    }
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                }
            }
            .padding(.top, 8)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG

#Preview("Camera Not Found - Timeout") {
    CameraDiscoveryNotFoundView(
        title: "No camera found",
        message: "Make sure your camera is turned on and connected to WiFi.",
        bullets: [],
        iconSystemName: "camera.metering.unknown",
        showsManualIP: true,
        onRetry: {},
        onManualIP: {}
    )
}

#Preview("Camera Not Found - With Bullets") {
    CameraDiscoveryNotFoundView(
        title: "Connection failed",
        message: "Check these common issues:",
        bullets: [
            "Camera is on the same WiFi network",
            "Camera WiFi is enabled",
            "Firewall is not blocking connections"
        ],
        iconSystemName: "wifi.exclamationmark",
        showsManualIP: true,
        onRetry: {},
        onManualIP: {}
    )
}

#Preview("Camera Not Found - No Manual IP") {
    CameraDiscoveryNotFoundView(
        title: "Camera not responding",
        message: "The camera may have been turned off or disconnected.",
        bullets: [],
        iconSystemName: "exclamationmark.triangle",
        showsManualIP: false,
        onRetry: {},
        onManualIP: {}
    )
}

#endif
