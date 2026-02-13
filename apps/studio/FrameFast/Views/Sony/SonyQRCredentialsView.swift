//  SonyQRCredentialsView.swift
//  FrameFast
//
//  Collects Sony camera WiFi credentials via QR code scanning.
//

import SwiftUI

struct SonyQRCredentialsView: View {
    let onBack: () -> Void
    let onSuccess: (WiFiCredentials, String?) -> Void

    @State private var showQRScanner = false
    @State private var qrError: String?

    var body: some View {
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
                        guideLine(index: 1, text: "MENU -> Network -> Control w/ Smartphone -> Connection")
                        guideLine(index: 2, text: "QR code appears on the camera screen")
                        guideLine(index: 3, text: "Keep this screen open")
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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Scan QR")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            onBack()
        }
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

    private func handleScannedQRCode(_ raw: String) {
        guard let parsed = SonyWiFiQRCode.parse(raw) else {
            qrError = "Unsupported QR code. Please scan the QR shown on the camera WiFi screen."
            return
        }

        let credentials = WiFiCredentials(ssid: parsed.ssid, password: parsed.password)
        onSuccess(credentials, parsed.cameraId)
    }
}

#if DEBUG

#Preview("Sony QR Credentials") {
    NavigationStack {
        SonyQRCredentialsView(
            onBack: {},
            onSuccess: { _, _ in }
        )
    }
}

#endif
