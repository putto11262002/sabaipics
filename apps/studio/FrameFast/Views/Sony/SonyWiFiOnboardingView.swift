//  SonyWiFiOnboardingView.swift
//  FrameFast

import SwiftUI

struct SonyWiFiOnboardingView: View {
    enum Mode: Equatable {
        case qr
        case manual
    }

    @State private var showQRScanner: Bool = false
    @State private var qrError: String? = nil
    @State private var joining: (credentials: WiFiCredentials, cameraId: String?)? = nil

    // Manual entry
    @State private var ssid: String = ""
    @State private var password: String = ""
    @State private var manualError: String? = nil

    @FocusState private var ssidFocused: Bool
    @FocusState private var passwordFocused: Bool
    private let previewWiFiInfo: WiFiIPv4Info?
    private let mode: Mode
    private let onBack: () -> Void
    private let onContinue: (_ joinInfo: SonyWiFiJoinViewModel.JoinInfo?) -> Void

    init(
        mode: Mode,
        previewWiFiInfo: WiFiIPv4Info? = nil,
        onBack: @escaping () -> Void,
        onContinue: @escaping (_ joinInfo: SonyWiFiJoinViewModel.JoinInfo?) -> Void
    ) {
        self.mode = mode
        self.previewWiFiInfo = previewWiFiInfo
        self.onBack = onBack
        self.onContinue = onContinue
    }

    var body: some View {
        Group {
            if let joining {
                WiFiJoinView(
                    credentials: joining.credentials,
                    onContinue: { credentials in
                        onContinue(SonyWiFiJoinViewModel.JoinInfo(credentials: credentials, cameraId: joining.cameraId))
                    },
                    onCancel: {
                        self.joining = nil
                    },
                    previewWiFiInfo: previewWiFiInfo
                )
            } else {
                ssidInput
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.Theme.background.ignoresSafeArea())
                    .navigationTitle(navigationTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .navigationBarBackButtonHidden(true)
                    .appBackButton {
                        onBack()
                    }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fullScreenCover(isPresented: $showQRScanner) {
            QRCodeScannerView {
                showQRScanner = false
                handleScannedQRCode($0)
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

                    Text("Then tap Scan QR in FrameFast.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    if let qrError {
                        Text(qrError)
                            .font(.footnote)
                            .foregroundColor(.red)
                            .padding(.top, 4)
                    }
                }
                .padding(20)
            }

            Button("Scan QR") {
                qrError = nil
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
                    TextField("DIRECT-...", text: $ssid)
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
                    SecureField("Password", text: $password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .textFieldStyle(.themed(isFocused: $passwordFocused))
                        .focused($passwordFocused)
                }

                if let manualError {
                    Text(manualError)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.top, 4)
                }

                Spacer(minLength: 12)

                Button("Join WiFi") {
                    ssidFocused = false
                    passwordFocused = false
                    joinFromManualInput()
                }
                .buttonStyle(.primary)
            }
            .padding(20)
        }
    }

    private func handleScannedQRCode(_ raw: String) {
        qrError = nil
        manualError = nil

        guard let parsed = SonyWiFiQRCode.parse(raw) else {
            qrError = "Unsupported QR code. Please scan the QR shown on the camera WiFi screen."
            return
        }

        joining = (WiFiCredentials(ssid: parsed.ssid, password: parsed.password), parsed.cameraId)
    }

    private func joinFromManualInput() {
        let trimmedSSID = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSSID.isEmpty else {
            manualError = "SSID is required."
            return
        }

        ssid = trimmedSSID
        password = trimmedPassword
        manualError = nil
        qrError = nil

        joining = (WiFiCredentials(ssid: trimmedSSID, password: trimmedPassword.isEmpty ? nil : trimmedPassword), nil)
    }
}

#if DEBUG

#Preview("Sony Onboarding - QR Intro") {
    NavigationView {
        SonyWiFiOnboardingView(mode: .qr, onBack: {}, onContinue: { _ in })
    }
}

#Preview("Sony Onboarding - Manual Intro") {
    NavigationView {
        SonyWiFiOnboardingView(mode: .manual, onBack: {}, onContinue: { _ in })
    }
}

#Preview("Sony Onboarding - Connectivity Guide") {
    NavigationView {
        WiFiConnectivityGuideView(
            wifiInfo: WiFiIPv4Info(ip: 0xC0A87A17, netmask: 0xFFFFFF00),
            onSkip: {},
            onDone: {}
        )
        .navigationTitle("Scan QR")
    }
}

#endif
