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
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(Color.secondary)
                    .padding(.horizontal, 20)
            }

            if !bullets.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(bullets, id: \.self) { bullet in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•")
                                .foregroundColor(Color.secondary)
                            Text(bullet)
                                .foregroundColor(Color.secondary)
                        }
                        .font(.subheadline)
                    }
                }
                .padding(.top, 12)
                .padding(.horizontal, 20)
            }

            Spacer()

            if let icon = iconSystemName {
                Image(systemName: icon)
                    .font(.system(size: 48))
                    .foregroundColor(Color.secondary.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .center)
            }

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

#Preview("Camera Not Found") {
    CameraDiscoveryNotFoundView(
        title: "Connection failed",
        message: "Unable to connect to camera. Check your connection and try again.",
        bullets: [],
        iconSystemName: "exclamationmark.triangle",
        onRetry: {}
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
        onRetry: {}
    )
}

#endif
