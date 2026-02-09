//  CanonHotspotSetupView.swift
//  FrameFast
//
//  Personal Hotspot setup instructions for Canon/Nikon cameras.

import SwiftUI

struct CanonHotspotSetupView: View {
    let onNext: () -> Void

    @State private var showHotspotWarning = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "personalhotspot")
                .font(.system(size: 48))
                .foregroundStyle(Color.Theme.primary)

            Text("Enable Personal Hotspot")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)

            Text("Your camera connects through this iPhone's Personal Hotspot. Enable it in **Settings** before continuing.")
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button("Continue") {
                if NetworkScannerService.isHotspotActive() {
                    onNext()
                } else {
                    showHotspotWarning = true
                }
            }
            .buttonStyle(.compact)
            .padding(.top, 4)

            Spacer()
        }
        .alert("Hotspot not detected", isPresented: $showHotspotWarning) {
            Button("Cancel", role: .cancel) {}
            Button("Continue anyway") { onNext() }
        } message: {
            Text("Personal Hotspot doesn't appear to be active. You can continue, but the camera may not be found.")
        }
    }
}

#if DEBUG

#Preview("Canon Hotspot Setup") {
    NavigationStack {
        CanonHotspotSetupView(onNext: {})
    }
}

#endif
