//  WiFiJoinView.swift
//  FrameFast

import SwiftUI

struct WiFiJoinView: View {
    let title: String
    let credentials: WiFiCredentials
    let onContinue: (WiFiCredentials) -> Void
    let onCancel: () -> Void

    var errorSecondaryActionTitle: String? = nil
    var onErrorSecondaryAction: (() -> Void)? = nil

    var previewWiFiInfo: WiFiIPv4Info? = nil

    @StateObject private var viewModel: WiFiJoinViewModel

    init(
        title: String = "Joining camera WiFi...",
        credentials: WiFiCredentials,
        onContinue: @escaping (WiFiCredentials) -> Void,
        onCancel: @escaping () -> Void,
        errorSecondaryActionTitle: String? = nil,
        onErrorSecondaryAction: (() -> Void)? = nil,
        previewWiFiInfo: WiFiIPv4Info? = nil
    ) {
        self.title = title
        self.credentials = credentials
        self.onContinue = onContinue
        self.onCancel = onCancel
        self.errorSecondaryActionTitle = errorSecondaryActionTitle
        self.onErrorSecondaryAction = onErrorSecondaryAction
        self.previewWiFiInfo = previewWiFiInfo
        _viewModel = StateObject(wrappedValue: WiFiJoinViewModel(credentials: credentials))
    }

    private var wifiInfo: WiFiIPv4Info? {
        previewWiFiInfo ?? WiFiNetworkInfo.currentWiFiIPv4()
    }

    var body: some View {
        VStack(spacing: 0) {
            switch viewModel.step {
            case .joining:
                WiFiJoiningView(title: title, ssid: credentials.ssid)

            case .error(let message):
                WiFiJoinErrorView(
                    title: "Couldn’t join Wi‑Fi",
                    subtitle: message,
                    onRetry: { viewModel.retry() },
                    secondaryActionTitle: errorSecondaryActionTitle,
                    onSecondaryAction: onErrorSecondaryAction
                )

            case .connectivityGuide:
                WiFiConnectivityGuideView(
                    wifiInfo: wifiInfo,
                    onSkip: { onContinue(credentials) },
                    onDone: { onContinue(credentials) }
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.Theme.background.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            viewModel.cancel()
            onCancel()
        }
        .onAppear {
            viewModel.start()
        }
    }
}

#if DEBUG

#Preview("WiFi Join") {
    NavigationStack {
        WiFiJoinView(
            credentials: WiFiCredentials(ssid: "DIRECT-TEST", password: nil),
            onContinue: { _ in },
            onCancel: {}
        )
    }
}

#endif
