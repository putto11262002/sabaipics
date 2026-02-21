//  CameraDiscoveryScanningView.swift
//  FrameFast
//
//  Pure UI view for camera discovery "scanning" state.
//

import SwiftUI

struct CameraDiscoveryScanningView: View {
    let title: String
    let message: String

    @State private var sweep = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.horizontal, 20)
            }

            Spacer()

            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))
                .offset(x: sweep ? 24 : -24, y: sweep ? -8 : 8)
                .rotationEffect(.degrees(sweep ? 12 : -12))
                .animation(
                    .easeInOut(duration: 1.8).repeatForever(autoreverses: true),
                    value: sweep
                )
                .frame(maxWidth: .infinity, alignment: .center)

            Spacer()
        }
        .onAppear { sweep = true }
    }
}

#if DEBUG

#Preview("Camera Scanning") {
    CameraDiscoveryScanningView(
        title: "Looking for cameras...",
        message: "Scanning your network for available cameras."
    )
}

#Preview("Camera Scanning - Short Message") {
    CameraDiscoveryScanningView(
        title: "Connecting to camera...",
        message: "Please wait."
    )
}

#endif
