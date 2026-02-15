//  CanonAPSetupView.swift
//  FrameFast
//
//  Canon camera AP setup instructions.

import SwiftUI

struct CanonAPSetupView: View {
    let onNext: () -> Void

    @State private var showWiFiWarning = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "wifi")
                .font(.system(size: 48))
                .foregroundStyle(Color.Theme.primary)

            Text("Connect to Camera's WiFi")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)

            Text("Connect to your Canon camera's WiFi network in **Settings** before continuing.")
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
        .alert("WiFi not detected", isPresented: $showWiFiWarning) {
            Button("Cancel", role: .cancel) {}
            Button("Continue anyway") { onNext() }
        } message: {
            Text("You don't appear to be connected to a WiFi network. Make sure you're connected to your camera's WiFi before continuing.")
        }
    }
}

#if DEBUG

#Preview("Canon AP Setup") {
    NavigationStack {
        CanonAPSetupView(onNext: {})
    }
}

#endif
