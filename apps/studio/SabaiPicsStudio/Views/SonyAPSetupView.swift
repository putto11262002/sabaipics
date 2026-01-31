//  SonyAPSetupView.swift
//  SabaiPicsStudio
//
//  Sony AP-mode setup wizard.
//  Supports QR scan + in-app WiFi join (NEHotspotConfiguration), plus a
//  network-check step that explains optional real-time upload setup.
//

import SwiftUI
import NetworkExtension
#if canImport(os)
import os
#endif
#if canImport(UIKit)
import UIKit
#endif

struct SonyAPSetupView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    @Environment(\.openURL) private var openURL

    @State private var showBackConfirmation = false
    @State private var step: Step = .intro
    @State private var showQRScanner = false
    @State private var qrError: String?
    @State private var qrPayload: SonyWiFiQRCode?
    @State private var joinError: String?
    @State private var isJoining = false
    @State private var showInternetGuide = false

    private enum Step {
        case intro
        case joining
        case networkCheck
    }

    private enum JoinError: Error {
        case timeout
    }

    private var wifiInfo: WiFiIPv4Info? {
        WiFiNetworkInfo.currentWiFiIPv4()
    }

    var body: some View {
        VStack(spacing: 0) {
            switch step {
            case .intro:
                intro
            case .joining:
                joining
            case .networkCheck:
                networkCheck
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: {
                    showBackConfirmation = true
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .medium))
                        Text("Back")
                    }
                    .foregroundColor(Color.Theme.primary)
                }
            }
        }
        .fullScreenCover(isPresented: $showQRScanner) {
            QRCodeScannerView {
                handleScannedQRCode($0)
            } onCancel: {
                showQRScanner = false
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showInternetGuide) {
            SonyInternetGuideView(wifiInfo: wifiInfo)
        }
        .alert("Go back?", isPresented: $showBackConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Go Back", role: .destructive) {
                captureFlow.backToManufacturerSelection()
            }
        } message: {
            Text("Return to manufacturer selection?")
        }
    }

    private var intro: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 70))
                .foregroundColor(Color.Theme.primary)

            Text("Connect Your Sony Camera")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Color.Theme.foreground)

            VStack(alignment: .leading, spacing: 14) {
                HotspotInstructionRow(
                    number: 1,
                    parts: [
                        .muted("On the camera: enable "),
                        .prominent("Smartphone Control"),
                        .muted(" / Wi-Fi")
                    ]
                )
                HotspotInstructionRow(
                    number: 2,
                    parts: [
                        .muted("Choose "),
                        .prominent("QR Code"),
                        .muted(" on the camera screen")
                    ]
                )
                HotspotInstructionRow(
                    number: 3,
                    parts: [
                        .muted("Scan the QR code here to join camera WiFi")
                    ]
                )

                Text("Tip: Transfer works without internet. Real-time upload is optional.")
                    .font(.footnote)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.top, 4)

                if let qrError {
                    Text(qrError)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 32)

            Spacer()

            Button("Scan QR Code (Recommended)") {
                qrError = nil
                showQRScanner = true
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 40)

            Button("I already joined camera WiFi") {
                step = .networkCheck
            }
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
            .padding(.top, 6)

            Button("Open Settings") {
                #if canImport(UIKit)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    openURL(url)
                }
                #endif
            }
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
            .padding(.bottom, 40)
        }
    }

    private var joining: some View {
        VStack(spacing: 18) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)

            Text(isJoining ? "Joining camera WiFi..." : "")
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)

            if let qrPayload {
                Text(qrPayload.ssid)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
            }

            if let joinError {
                Text(joinError)
                    .font(.footnote)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            Button("Try Again") {
                joinError = nil
                if let qrPayload {
                    Task { await joinSonyWiFi(using: qrPayload) }
                } else {
                    step = .intro
                }
            }
            .buttonStyle(.secondary)
            .padding(.horizontal, 40)

            Button("Open Settings") {
                #if canImport(UIKit)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    openURL(url)
                }
                #endif
            }
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
            .padding(.bottom, 40)
        }
    }

    private var networkCheck: some View {
        VStack(spacing: 18) {
            Spacer()

            Image(systemName: "wifi")
                .font(.system(size: 56))
                .foregroundColor(Color.Theme.primary)

            Text("Network Check")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)

            VStack(spacing: 10) {
                if let qrPayload {
                    Text("Camera WiFi: \(qrPayload.ssid)")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                }

                if let wifiInfo {
                    Text("WiFi IP: \(wifiInfo.ipString)")
                        .font(.subheadline)
                    Text("Subnet Mask: \(wifiInfo.netmaskString)")
                        .font(.subheadline)
                } else {
                    Text("WiFi not detected yet. Join the camera WiFi (DIRECT-...) then try again.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }
            .foregroundColor(Color.Theme.foreground)
            .padding(.top, 6)

            Divider()
                .padding(.horizontal, 24)

            VStack(spacing: 10) {
                Text("Do you want real-time upload while connected to the camera WiFi?")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.foreground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Text("Most camera WiFi networks have no internet. Transfer works either way.")
                    .font(.footnote)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            Button("Continue (Transfer only)") {
                captureFlow.proceedToDiscovery()
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 40)

            Button("Set up Real-time Upload") {
                showInternetGuide = true
            }
            .buttonStyle(.secondary)
            .padding(.horizontal, 40)

            Button("Open Settings") {
                #if canImport(UIKit)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    openURL(url)
                }
                #endif
            }
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
            .padding(.bottom, 40)
        }
    }

    private func handleScannedQRCode(_ raw: String) {
        showQRScanner = false

        guard let parsed = SonyWiFiQRCode.parse(raw) else {
            qrError = "Unsupported QR code. Please scan the QR shown on the camera WiFi screen."
            return
        }

        qrPayload = parsed
        qrError = nil
        joinError = nil
        step = .joining
        Task { await joinSonyWiFi(using: parsed) }
    }

    private func joinSonyWiFi(using qr: SonyWiFiQRCode) async {
        await MainActor.run {
            isJoining = true
            joinError = nil
            step = .joining
        }

        let config = NEHotspotConfiguration(ssid: qr.ssid, passphrase: qr.password, isWEP: false)
        // Persist so the user can one-tap reconnect in the future.
        config.joinOnce = false

        do {
            try await applyHotspotConfiguration(config, timeout: 8.0)

            // Wait briefly for WiFi interface to populate IP.
            for _ in 0..<15 {
                if WiFiNetworkInfo.currentWiFiIPv4() != nil {
                    break
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }

            // Store this QR for the *current* network signature so we can attach
            // SSID/cameraId metadata when the PTP/IP session is created.
            SonyAPConnectionCache.shared.savePendingQRCodeForCurrentNetwork(qr)

            await MainActor.run {
                isJoining = false
                step = .networkCheck
            }
        } catch {
            await MainActor.run {
                isJoining = false
                let base = "Could not join WiFi automatically. You can join it in Settings, then continue."
                if let joinError = error as? JoinError, joinError == .timeout {
                    self.joinError = "\(base) (Timed out waiting for iOS WiFi join.)"
                } else {
                    self.joinError = "\(base) (\(error.localizedDescription))"
                }
                step = .joining
            }
        }
    }

    private func applyHotspotConfiguration(_ config: NEHotspotConfiguration, timeout: TimeInterval) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
                var shouldResume = false
                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true
                }
                if shouldResume {
                    cont.resume(throwing: JoinError.timeout)
                }
            }

            Task { @MainActor in
                NEHotspotConfigurationManager.shared.apply(config) { error in
                    var shouldResume = false
                    lock.withLock {
                        guard !resumed else { return }
                        resumed = true
                        shouldResume = true
                    }
                    guard shouldResume else { return }

                    if let error {
                        // If we're already connected to this SSID, treat as success.
                        if isAlreadyAssociated(error) {
                            cont.resume()
                            return
                        }

                        let ns = error as NSError
                        print("[SonyAPSetup] NEHotspotConfiguration apply failed domain=\(ns.domain) code=\(ns.code) desc=\(ns.localizedDescription)")
                        cont.resume(throwing: error)
                        return
                    }

                    cont.resume()
                }
            }
        }
    }

    private func isAlreadyAssociated(_ error: Error) -> Bool {
        let ns = error as NSError
        if ns.domain == NEHotspotConfigurationErrorDomain,
           ns.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
            return true
        }

        return false
    }
}

#Preview("Sony AP Setup") {
    NavigationView {
        let app = AppCoordinator()
        let flow = CaptureFlowCoordinator()
        flow.appCoordinator = app
        return SonyAPSetupView()
            .environmentObject(flow)
    }
}
