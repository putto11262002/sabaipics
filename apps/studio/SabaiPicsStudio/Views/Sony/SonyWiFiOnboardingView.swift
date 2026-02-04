//  SonyWiFiOnboardingView.swift
//  SabaiPicsStudio

import SwiftUI

struct SonyWiFiOnboardingView: View {
    enum Mode: Equatable {
        case qr
        case manual
    }

    @StateObject private var viewModel: SonyWiFiJoinViewModel
    @State private var showQRScanner: Bool = false
    @FocusState private var ssidFocused: Bool
    @FocusState private var passwordFocused: Bool
    private let previewWiFiInfo: WiFiIPv4Info?
    private let mode: Mode
    private let onBack: () -> Void
    private let onContinue: () -> Void

    private var wifiInfo: WiFiIPv4Info? {
        previewWiFiInfo ?? WiFiNetworkInfo.currentWiFiIPv4()
    }

    init(
        mode: Mode,
        viewModel: SonyWiFiJoinViewModel = SonyWiFiJoinViewModel(step: .intro),
        previewWiFiInfo: WiFiIPv4Info? = nil,
        onBack: @escaping () -> Void,
        onContinue: @escaping () -> Void
    ) {
        self.mode = mode
        _viewModel = StateObject(wrappedValue: viewModel)
        self.previewWiFiInfo = previewWiFiInfo
        self.onBack = onBack
        self.onContinue = onContinue
    }

    var body: some View {
        VStack(spacing: 0) {
            switch viewModel.step {
            case .intro:
                ssidInput
            case .joining:
                if let errorMessage = viewModel.errorMessage {
                    SonyWiFiJoinErrorView(
                        title: "Couldn’t join Wi‑Fi",
                        subtitle: "Make sure you’re connected to the camera Wi‑Fi, then try again.",
                        onRetry: { viewModel.retry() }
                    )
                } else {
                    SonyWiFiJoiningView(
                        title: "Joining camera WiFi...",
                        ssid: viewModel.qrPayload?.ssid ?? viewModel.ssid
                    )
                }
            case .connectivityGuide:
                SonyConnectivityGuideView(
                    wifiInfo: wifiInfo,
                    onSkip: { onContinue() },
                    onDone: { onContinue() }
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.Theme.background.ignoresSafeArea())
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            onBack()
        }
        .fullScreenCover(isPresented: $showQRScanner) {
            QRCodeScannerView {
                showQRScanner = false
                viewModel.handleScannedQRCode($0)
            } onCancel: {
                showQRScanner = false
            }
            .ignoresSafeArea()
        }
    }

    private var navigationTitle: String {
        switch mode {
        case .qr:
            return "Scan QR"
        case .manual:
            return "Enter SSID"
        }
    }

    @ViewBuilder
    private var ssidInput: some View {
        switch mode {
        case .qr:
            qrSSID
        case .manual:
            manualSSID
        }
    }

    private var qrSSID: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Connect with QR")
                        .font(.headline)
                        .foregroundColor(Color.Theme.foreground)

                    Text("Follow these steps on the camera, then scan the QR.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    VStack(alignment: .leading, spacing: 10) {
                        qrGuideLine(index: 1, text: "MENU -> Network -> Control w/ Smartphone -> Connection")
                        qrGuideLine(index: 2, text: "QR code appears on the camera screen")
                        qrGuideLine(index: 3, text: "Keep this screen open")
                    }

                    Text("Then tap Scan QR in SabaiPics Studio.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    if let qrError = viewModel.qrError {
                        Text(qrError)
                            .font(.footnote)
                            .foregroundColor(.red)
                            .padding(.top, 4)
                    }
                }
                .padding(20)
            }

            Button("Scan QR") {
                viewModel.qrError = nil
                showQRScanner = true
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .background(Color.Theme.background)
        }
    }

    private func qrGuideLine(index: Int, text: String) -> some View {
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

    private var manualSSID: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("WiFi name (SSID)")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                    TextField("DIRECT-...", text: $viewModel.ssid)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .textFieldStyle(.themed(isFocused: $ssidFocused))
                        .focused($ssidFocused)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                    SecureField("Password", text: $viewModel.password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .textFieldStyle(.themed(isFocused: $passwordFocused))
                        .focused($passwordFocused)
                }

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.top, 4)
                }

                Spacer(minLength: 12)

                Button("Join WiFi") {
                    ssidFocused = false
                    passwordFocused = false
                    viewModel.joinFromManualInput()
                }
                .buttonStyle(.primary)
            }
            .padding(20)
        }
    }
}

#if DEBUG

#Preview("Sony Onboarding - QR Intro") {
    NavigationView {
        SonyWiFiOnboardingView(mode: .qr, onBack: {}, onContinue: {})
    }
}

#Preview("Sony Onboarding - Manual Intro") {
    NavigationView {
        SonyWiFiOnboardingView(mode: .manual, onBack: {}, onContinue: {})
    }
}

#Preview("Sony Onboarding - Joining") {
    NavigationView {
        SonyWiFiOnboardingView(
            mode: .qr,
            viewModel: {
                let vm = SonyWiFiJoinViewModel(step: .joining)
                vm.isJoining = true
                vm.qrPayload = SonyWiFiQRCode(ssidSuffix: "cWE1", password: "MQGMTeKr", cameraModel: "ILCE-7RM4", cameraId: "D44DA4344543")
                return vm
            }(),
            onBack: {},
            onContinue: {}
        )
    }
}

#Preview("Sony Onboarding - Join Error") {
    NavigationView {
        SonyWiFiOnboardingView(
            mode: .qr,
            viewModel: {
                let vm = SonyWiFiJoinViewModel(step: .joining)
                vm.isJoining = false
                vm.qrPayload = SonyWiFiQRCode(ssidSuffix: "cWE1", password: "MQGMTeKr", cameraModel: "ILCE-7RM4", cameraId: "D44DA4344543")
                vm.errorMessage = "Mock: join failed"
                return vm
            }(),
            onBack: {},
            onContinue: {}
        )
    }
}

#Preview("Sony Onboarding - Connectivity Guide") {
    NavigationView {
        SonyWiFiOnboardingView(
            mode: .qr,
            viewModel: SonyWiFiJoinViewModel(step: .connectivityGuide),
            previewWiFiInfo: WiFiIPv4Info(ip: 0xC0A87A17, netmask: 0xFFFFFF00),
            onBack: {},
            onContinue: {}
        )
    }
}

#endif
