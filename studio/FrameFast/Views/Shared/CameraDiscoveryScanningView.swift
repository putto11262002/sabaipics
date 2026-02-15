//  CameraDiscoveryScanningView.swift
//  FrameFast
//
//  Pure UI view for camera discovery "scanning" state.
//

import SwiftUI

struct CameraDiscoveryScanningView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "magnifyingglass")
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
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
