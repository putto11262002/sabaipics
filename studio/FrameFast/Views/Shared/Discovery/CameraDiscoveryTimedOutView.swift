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
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                bulletRow("Connect to your camera's Wi‑Fi network")
                bulletRow(settingsAttributedText)
            }
            .padding(.horizontal, 20)

            Spacer()

            Image(systemName: "wifi.exclamationmark")
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

    private func bulletRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .foregroundColor(Color.Theme.mutedForeground)
            Text(text)
                .foregroundColor(Color.Theme.mutedForeground)
        }
        .font(.subheadline)
    }

    private func bulletRow(_ text: AttributedString) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .foregroundColor(Color.Theme.mutedForeground)
            Text(text)
                .foregroundColor(Color.Theme.mutedForeground)
        }
        .font(.subheadline)
    }

    private var settingsAttributedText: AttributedString {
        var text = AttributedString("Enable Local Network access in Settings")
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
    CameraDiscoveryTimedOutView(onRetry: {})
}

#endif
