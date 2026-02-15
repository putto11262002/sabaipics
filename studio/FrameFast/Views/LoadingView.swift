//
//  LoadingView.swift
//  FrameFast
//
//  Created: 2026-01-29
//
//  Branded loading screen shown during app initialization.
//

import SwiftUI

/// Loading screen with pulsing logo and tagline.
///
/// Shows while:
/// - Clerk session is being restored
/// - Minimum 2-second display time
struct LoadingView: View {
    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Pulsing logo
            Image("FrameFastLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 120)
                .scaleEffect(isPulsing ? 1.0 : 0.85)
                .opacity(isPulsing ? 1.0 : 0.6)
                .animation(
                    .easeInOut(duration: 1.5)
                    .repeatForever(autoreverses: true),
                    value: isPulsing
                )
                .onAppear {
                    isPulsing = true
                }

            // Tagline
            Text("You shoot, we handle the rest.")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    LoadingView()
}
