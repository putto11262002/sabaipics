//  SonyConnectivityGuideView.swift
//  FrameFast
//
//  Connectivity guide for camera WiFi.
//  Camera-hosted WiFi often has no internet. iPhone can use cellular for internet
//  while staying connected to the camera (depending on settings and conditions).
//

import SwiftUI

struct WiFiConnectivityGuideView: View {
    let wifiInfo: WiFiIPv4Info?
    let onSkip: () -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Connectivity")
                        .font(.headline)
                        .foregroundColor(Color.Theme.foreground)

                    Text("Camera WiFi usually has no internet. For real-time uploads, keep the camera WiFi connected and use cellular for internet.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    VStack(alignment: .leading, spacing: 10) {
                        guideLine(index: 1, text: "Settings > Cellular > Cellular Data: On")
                        guideLine(index: 2, text: "Settings > Cellular > FrameFast: On")
                        guideLine(index: 3, text: "Settings > Cellular > Wi-Fi Assist: On (optional; foreground only)")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text("Transfers work without internet. If uploads fail, you can upload later on a normal network.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                }
                .padding(20)
            }

            HStack(spacing: 12) {
                Button("Skip") { onSkip() }
                    .buttonStyle(.secondary)

                Button("Continue") { onDone() }
                    .buttonStyle(.primary)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
        }
    }
}

@available(*, deprecated, message: "Use WiFiConnectivityGuideView")
typealias SonyConnectivityGuideView = WiFiConnectivityGuideView

private func guideLine(index: Int, text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
        ZStack {
            Circle()
                .stroke(Color.Theme.border, lineWidth: 1)
                .frame(width: 22, height: 22)
            Text("\(index)")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)
        }
        .padding(.top, 1)

        Text(text)
            .font(.subheadline)
            .foregroundColor(Color.Theme.foreground)

        Spacer(minLength: 0)
    }
}


#if DEBUG
#Preview("Sony Connectivity Guide") {
    NavigationView {
        WiFiConnectivityGuideView(
            wifiInfo: WiFiIPv4Info(ip: 0xC0A8010A, netmask: 0xFFFFFF00),
            onSkip: {},
            onDone: {}
        )
    }
}
#endif
