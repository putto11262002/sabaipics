//  SonyWiFiJoinStatusView.swift
//  SabaiPicsStudio

import SwiftUI

struct WiFiJoiningView: View {
    let title: String
    let ssid: String?

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text(displayTitle)
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var displayTitle: String {
        if let ssid, !ssid.isEmpty {
            return "Joining \(ssid)"
        }
        return title
    }
}

struct WiFiJoinErrorView: View {
    let title: String
    let subtitle: String
    let onRetry: () -> Void

    var secondaryActionTitle: String? = nil
    var onSecondaryAction: (() -> Void)? = nil

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

            VStack(spacing: 10) {
                Button("Try Again") {
                    onRetry()
                }
                .buttonStyle(.compact)

                if let secondaryActionTitle, let onSecondaryAction {
                    Button(secondaryActionTitle) {
                        onSecondaryAction()
                    }
                    .buttonStyle(.compact)
                }
            }
            .padding(.horizontal, 32)
            .padding(.top, 8)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

@available(*, deprecated, message: "Use WiFiJoiningView")
typealias SonyWiFiJoiningView = WiFiJoiningView

@available(*, deprecated, message: "Use WiFiJoinErrorView")
typealias SonyWiFiJoinErrorView = WiFiJoinErrorView

#if DEBUG

#Preview("WiFi Joining with SSID") {
    WiFiJoiningView(title: "Joining camera WiFi...", ssid: "DIRECT-cWE1:ILCE-7RM4")
        .background(Color.Theme.background)
}

#Preview("WiFi Joining without SSID") {
    WiFiJoiningView(title: "Joining camera WiFi...", ssid: nil)
        .background(Color.Theme.background)
}

#Preview("WiFi Join Error") {
    WiFiJoinErrorView(
        title: "Couldn't join Wi‑Fi",
        subtitle: "Check your camera Wi‑Fi connection.",
        onRetry: {}
    )
    .background(Color.Theme.background)
}

#Preview("WiFi Join Error with Secondary") {
    WiFiJoinErrorView(
        title: "Couldn't join Wi‑Fi",
        subtitle: "Check your camera Wi‑Fi connection.",
        onRetry: {},
        secondaryActionTitle: "Enter IP Manually",
        onSecondaryAction: {}
    )
    .background(Color.Theme.background)
}

#endif
