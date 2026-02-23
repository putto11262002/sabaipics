//  SonySetupFlowView.swift
//  FrameFast
//
//  Sony-specific setup flow used as the `setup` view inside CameraConnectFlow.
//
//  Simplified to match Canon/Nikon pattern: single WiFi setup screen.
//  Previous multi-step flow (QR, manual credentials, WiFi join) is preserved
//  in sibling files for future use.

import SwiftUI

struct SonySetupFlowView: View {
    let onReady: () -> Void
    @Binding var ssid: String?
    @Binding var cameraId: String?

    @State private var showWiFiWarning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Connect to your Sony camera's WiFi network in Settings before continuing.")
                .font(.subheadline)
                .foregroundColor(Color.secondary)
                .padding(.horizontal, 20)
                .padding(.bottom, 32)

            CameraWiFiJoinScene(ssid: "Sony camera Wi‑Fi")
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 28)

            Spacer()

            HStack {
                Spacer()
                CircleNavButton {
                    if WiFiNetworkInfo.currentWiFiIPv4() != nil {
                        onReady()
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
            Button("Continue anyway") { onReady() }
        } message: {
            Text("You're not on a local Wi-Fi network. You can continue, but the camera may not be found.")
        }
    }
}

#if DEBUG

#Preview("Sony Setup — Dark") {
    NavigationStack {
        SonySetupFlowView(
            onReady: {},
            ssid: .constant(nil),
            cameraId: .constant(nil)
        )
    }
    .preferredColorScheme(.dark)
}

#Preview("Sony Setup — Light") {
    NavigationStack {
        SonySetupFlowView(
            onReady: {},
            ssid: .constant(nil),
            cameraId: .constant(nil)
        )
    }
    .preferredColorScheme(.light)
}

#endif
