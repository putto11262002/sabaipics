//  CanonAPSetupView.swift
//  FrameFast
//
//  Canon camera AP setup instructions.
//  Shows a mock WiFi settings list with a pulsing beacon on the camera network.

import SwiftUI

struct CanonAPSetupView: View {
    let onNext: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Connect to your Canon camera's WiFi network in Settings before continuing.")
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .padding(.horizontal, 20)
                .padding(.bottom, 32)

            CameraWiFiJoinScene(ssid: "Canon camera Wi‑Fi")
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 28)

            Spacer()

            HStack {
                Spacer()
                CircleNavButton { onNext() }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .navigationTitle("Connect to WiFi")
        .navigationBarTitleDisplayMode(.large)
    }
}

#if DEBUG

#Preview("Canon AP Setup — Dark") {
    NavigationStack {
        CanonAPSetupView(onNext: {})
    }
    .preferredColorScheme(.dark)
}

#Preview("Canon AP Setup — Light") {
    NavigationStack {
        CanonAPSetupView(onNext: {})
    }
    .preferredColorScheme(.light)
}

#endif
