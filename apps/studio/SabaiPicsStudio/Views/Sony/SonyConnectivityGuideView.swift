//  SonyConnectivityGuideView.swift
//  SabaiPicsStudio
//
//  Connectivity guide for camera WiFi.
//  Camera-hosted WiFi often has no internet. iPhone can use cellular for internet
//  while staying connected to the camera (depending on settings and conditions).
//

import SwiftUI

struct SonyConnectivityGuideView: View {
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

                    VStack(alignment: .leading, spacing: 0) {
                        guideRow(index: 1, text: "Settings > Cellular > Cellular Data: On")
                        divider
                        guideRow(index: 2, text: "Settings > Cellular > SabaiPics Studio: On")
                        divider
                        guideRow(index: 3, text: "Settings > Cellular > Wi-Fi Assist: On (optional; foreground only)")
                    }

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
            .background(Color.Theme.background)
        }
    }
}

private var divider: some View {
    Rectangle()
        .fill(Color.Theme.border)
        .frame(height: 1)
}

private func guideRow(index: Int, text: String) -> some View {
    HStack(alignment: .center, spacing: 12) {
        ZStack {
            Circle()
                .fill(Color.Theme.background)
                .overlay(Circle().stroke(Color.Theme.border, lineWidth: 1))
            Text("\(index)")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(Color.Theme.foreground)
        }
        .frame(width: 28, height: 28)

        Text(text)
            .font(.subheadline)
            .foregroundColor(Color.Theme.foreground)

        Spacer(minLength: 0)
    }
    .padding(14)
}

#if DEBUG
#Preview("Sony Connectivity Guide") {
    NavigationView {
        SonyConnectivityGuideView(
            wifiInfo: WiFiIPv4Info(ip: 0xC0A8010A, netmask: 0xFFFFFF00),
            onSkip: {},
            onDone: {}
        )
    }
}
#endif
