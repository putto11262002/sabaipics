//  SonyAPNewCameraDecisionView.swift
//  FrameFast
//
//  UI-only decision screen for adding a new Sony camera.
//  Wiring happens elsewhere.
//

import SwiftUI

struct SonyAPNewCameraDecisionView: View {
    let isWiFiConnected: Bool
    var showsManualIPOption: Bool = true

    var onScanQR: () -> Void = {}
    var onAlreadyOnWiFi: () -> Void = {}
    var onEnterSSID: () -> Void = {}
    var onManualIP: () -> Void = {}

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(spacing: 12) {
                    decisionCard(icon: "qrcode.viewfinder", title: "Scan QR Code", isEnabled: true, isPrimary: true, action: onScanQR)
                    if isWiFiConnected {
                        decisionCard(icon: "wifi", title: "Already on Camera WiFi", isEnabled: true, action: onAlreadyOnWiFi)
                    }
                    decisionCard(icon: "key.fill", title: "Enter SSID & Password", isEnabled: true, action: onEnterSSID)
                    if showsManualIPOption {
                        decisionCard(icon: "network", title: "Enter IP Manually", isEnabled: true, action: onManualIP)
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("New Sony Camera")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func decisionCard(icon: String, title: String, isEnabled: Bool, isPrimary: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(isPrimary ? Color.accentColor.opacity(0.14) : Color.accentColor.opacity(0.10))
                        .frame(width: 52, height: 52)

                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(Color.accentColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .fontWeight(isPrimary ? .semibold : .regular)
                        .foregroundColor(Color.primary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color.secondary)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(UIColor.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isPrimary ? Color.accentColor.opacity(0.9) : Color(UIColor.separator), lineWidth: isPrimary ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1.0 : 0.45)
    }
}

#Preview("New Sony Camera (WiFi)") {
    NavigationView {
        SonyAPNewCameraDecisionView(isWiFiConnected: true)
    }
}

#Preview("New Sony Camera (No WiFi)") {
    NavigationView {
        SonyAPNewCameraDecisionView(isWiFiConnected: false)
    }
}
