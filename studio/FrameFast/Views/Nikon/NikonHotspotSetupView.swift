//  NikonHotspotSetupView.swift
//  FrameFast
//
//  Nikon WiFi setup instructions.
//

import SwiftUI

struct NikonHotspotSetupView: View {
    let onNext: () -> Void

    @State private var showWiFiWarning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Connect to your Nikon camera's WiFi network in Settings before continuing.")
                .font(.subheadline)
                .foregroundColor(Color.secondary)
                .padding(.horizontal, 20)
                .padding(.bottom, 32)

            CameraWiFiJoinScene(ssid: "Nikon camera Wi‑Fi")
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 28)

            Spacer()

            HStack {
                Spacer()
                CircleNavButton {
                    if WiFiNetworkInfo.currentWiFiIPv4() != nil {
                        onNext()
                    } else {
                        showWiFiWarning = true
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .navigationTitle("Connect to WiFi")
        .navigationBarTitleDisplayMode(.large)
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
