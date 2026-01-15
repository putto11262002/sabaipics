//
//  ConnectingView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Premium searching/connecting screen with animated spinner
//

import SwiftUI

/// Searching/connecting screen with animated spinner
struct ConnectingView: View {
    let ipAddress: String
    let retryCount: Int
    let maxRetries: Int

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Animated spinner
            ProgressView()
                .scaleEffect(1.5)
                .progressViewStyle(CircularProgressViewStyle(tint: .blue))

            VStack(spacing: 8) {
                Text("Searching for camera...")
                    .font(.title3)
                    .fontWeight(.medium)

                Text(ipAddress)
                    .font(.body)
                    .foregroundColor(.secondary)

                if retryCount > 0 {
                    Text("Attempt \(retryCount + 1) of \(maxRetries)")
                        .font(.caption)
                        .foregroundColor(.orange)
                        .padding(.top, 8)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    ConnectingView(ipAddress: "172.20.10.2", retryCount: 0, maxRetries: 3)
}

#Preview("Retrying") {
    ConnectingView(ipAddress: "172.20.10.2", retryCount: 1, maxRetries: 3)
}
