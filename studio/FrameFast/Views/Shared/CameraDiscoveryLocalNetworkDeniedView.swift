//
//  CameraDiscoveryLocalNetworkDeniedView.swift
//  FrameFast
//
//  Pure UI view for camera discovery "local network denied" state.
//

import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

struct CameraDiscoveryLocalNetworkDeniedView: View {
    let title: String
    let message: String
    let bullets: [String]
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "lock.shield")
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

            VStack(spacing: 10) {
                Button("Open Settings") {
                    openSettings()
                }
                .buttonStyle(.compact)

                Button("Try Again") {
                    onRetry()
                }
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
            }
            .padding(.top, 8)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func openSettings() {
        #if canImport(UIKit)
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
        #endif
    }
}

#if DEBUG

#Preview("Local Network Denied") {
    CameraDiscoveryLocalNetworkDeniedView(
        title: "Allow Local Network access",
        message: "FrameFast Studio needs Local Network access to discover and connect to cameras on your WiFi.",
        bullets: [
            "If you see a permission prompt, tap Allow",
            "If you previously denied, enable it in Settings → Privacy & Security → Local Network"
        ],
        onRetry: {}
    )
}

#endif

