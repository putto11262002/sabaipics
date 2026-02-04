//  SonyWiFiJoinStatusView.swift
//  SabaiPicsStudio

import SwiftUI

struct SonyWiFiJoiningView: View {
    let title: String
    let ssid: String?

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text(title)
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)

            if let ssid, !ssid.isEmpty {
                Text(ssid)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct SonyWiFiJoinErrorView: View {
    let title: String
    let subtitle: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 36, weight: .semibold))
                .foregroundColor(Color.Theme.destructive)

            VStack(spacing: 10) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)

                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)

            Spacer()

            Button("Try Again") {
                onRetry()
            }
            .buttonStyle(.secondary)
            .padding(.horizontal, 40)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG

#Preview("Sony Joining") {
    SonyWiFiJoiningView(title: "Joining camera WiFi...", ssid: "DIRECT-cWE1:ILCE-7RM4")
}

#Preview("Sony Join Error") {
    SonyWiFiJoinErrorView(
        title: "Couldn’t join Wi‑Fi",
        subtitle: "Make sure you’re connected to the camera Wi‑Fi, then try again.",
        onRetry: {}
    )
}

#endif
