//  NikonHotspotSetupView.swift
//  SabaiPicsStudio
//
//  Nikon WiFi setup instructions.
//

import SwiftUI

struct NikonHotspotSetupView: View {
    let onNext: () -> Void

    @State private var showWiFiWarning = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "wifi")
                .font(.system(size: 48))
                .foregroundStyle(Color.Theme.primary)

            Text("Connect to Nikon Wi-Fi")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)

            Text("Join your camera's Wi-Fi network in **Settings**, then continue to scan for the camera.")
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button("Continue") {
                if WiFiNetworkInfo.currentWiFiIPv4() != nil {
                    onNext()
                } else {
                    showWiFiWarning = true
                }
            }
            .buttonStyle(.compact)
            .padding(.top, 4)

            Spacer()
        }
        .alert("Wi-Fi not detected", isPresented: $showWiFiWarning) {
            Button("Cancel", role: .cancel) {}
            Button("Continue anyway") { onNext() }
        } message: {
            Text("You're not on a local Wi-Fi network. You can continue, but the camera may not be found.")
        }
    }
}

#if DEBUG

#Preview("Nikon Hotspot Setup") {
    NavigationStack {
        NikonHotspotSetupView(onNext: {})
    }
}

#endif
