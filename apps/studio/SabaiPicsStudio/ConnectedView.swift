//
//  ConnectedView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Success celebration screen (auto-dismisses after 1.5 seconds)
//

import SwiftUI

/// Success celebration screen (auto-dismisses after 1.5 seconds)
struct ConnectedView: View {
    let cameraModel: String
    let ipAddress: String
    @Binding var shouldDismiss: Bool

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Success checkmark animation
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.2))
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.green)
            }
            .transition(.scale.combined(with: .opacity))

            VStack(spacing: 8) {
                Text("Connected")
                    .font(.title)
                    .fontWeight(.bold)

                Text(cameraModel)
                    .font(.headline)

                Text(ipAddress)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .onAppear {
            // Auto-dismiss after 1.5 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation {
                    shouldDismiss = true
                }
            }
        }
    }
}

#Preview {
    ConnectedView(
        cameraModel: "Canon EOS R5",
        ipAddress: "172.20.10.2",
        shouldDismiss: .constant(false)
    )
}
