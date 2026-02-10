//
//  CameraDiscoveryTimedOutView.swift
//  FrameFast
//
//  Dedicated UI for camera discovery timeout state.
//

import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

struct CameraDiscoveryTimedOutView: View {
    let showsManualIP: Bool
    let onRetry: () -> Void
    let onManualIP: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "camera.metering.unknown")
                .font(.system(size: 50))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

            VStack(spacing: 10) {
                Text("No camera found")
                    .font(.title3)
                    .fontWeight(.medium)

                Text("Make sure you're connected to your camera's Wi‑Fi, then try again.")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                Text(settingsAttributedText)
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
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

    private var settingsAttributedText: AttributedString {
        var text = AttributedString("Confirm Local Network access is enabled for FrameFast in Settings")
        #if canImport(UIKit)
        if let url = URL(string: UIApplication.openSettingsURLString),
           let range = text.range(of: "Settings") {
            text[range].link = url
            text[range].underlineStyle = .single
        }
        #endif
        return text
    }
}

#if DEBUG

#Preview("Camera Timed Out") {
    CameraDiscoveryTimedOutView(showsManualIP: true, onRetry: {}, onManualIP: {})
}

#endif
