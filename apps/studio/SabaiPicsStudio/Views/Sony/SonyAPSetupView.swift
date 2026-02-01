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
 

struct SonyAPSetupView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    
    @State private var step: Step = .intro
    @State private var showQRScanner = false
    @State private var qrError: String?
    @State private var qrPayload: SonyWiFiQRCode?
    @State private var joinError: String?
    @State private var isJoining = false

    private let previewMode: PreviewMode?
    private let previewWiFiInfo: WiFiIPv4Info?

    private enum Step {
        case intro
        case joining
        case networkCheck
    }

    enum PreviewMode {
        case guide
        case joining
        case joiningError
        case networkCheck
    }

    private enum JoinError: Error {
        case timeout
    }

    private var wifiInfo: WiFiIPv4Info? {
        previewWiFiInfo ?? WiFiNetworkInfo.currentWiFiIPv4()
    }

    init(previewMode: PreviewMode? = nil, previewWiFiInfo: WiFiIPv4Info? = nil, previewJoinError: String? = nil) {
        self.previewMode = previewMode
        self.previewWiFiInfo = previewWiFiInfo

        if let previewMode {
            switch previewMode {
            case .guide:
                _step = State(initialValue: .intro)
            case .joining:
                _step = State(initialValue: .joining)
            case .networkCheck:
                _step = State(initialValue: .networkCheck)
            case .joiningError:
                _step = State(initialValue: .joining)
                _joinError = State(initialValue: previewJoinError ?? "Mock: Could not join WiFi")
            }
        }
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
        .background(Color.Theme.background)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: {
                    captureFlow.state = .sonyNewCameraDecision
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
        
    }

    private var intro: some View {
        VStack(spacing: 18) {
            SonyQRStep1GuideBlockTimeline(
                title: "On your Sony camera",
                steps: [
                    SonyQRGuideStep(icon: "line.3.horizontal", text: "MENU"),
                    SonyQRGuideStep(icon: "network", text: "Network"),
                    SonyQRGuideStep(icon: "iphone", text: "Smartphone Control → On"),
                    SonyQRGuideStep(icon: "qrcode", text: "Connection (shows QR + SSID)")
                ]
            )

            mutedImagePlaceholder

            if let qrError {
                Text(qrError)
                    .font(.footnote)
                    .foregroundColor(.red)
                    .padding(.top, 4)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .safeAreaInset(edge: .bottom) {
            Button("Scan QR") {
                qrError = nil
                showQRScanner = true
            }
            .buttonStyle(WizardFooterCapsuleStyle())
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .background(Color.Theme.background)
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
            .padding(.bottom, 40)
        }
    }

    private var networkCheck: some View {
        SonyInternetGuideView(
            wifiInfo: wifiInfo,
            onSkip: { captureFlow.proceedToDiscovery() },
            onDone: { captureFlow.proceedToDiscovery() }
        )
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

            // Store join metadata for the *current* network signature so we can attach
            // SSID/cameraId metadata when the PTP/IP session is created.
            SonyAPConnectionCache.shared.savePendingJoinInfoForCurrentNetwork(ssid: qr.ssid, cameraId: qr.cameraId)

            await MainActor.run {
                isJoining = false
                step = .networkCheck
            }
        } catch {
            await MainActor.run {
                isJoining = false
                let base = "Could not join WiFi automatically. Join the camera WiFi, then try again."
                if let joinError = error as? JoinError, joinError == .timeout {
                    self.joinError = "\(base) (Timed out waiting for iOS WiFi join.)"
                } else {
                    self.joinError = "\(base) (\(error.localizedDescription))"
                }
                step = .joining
            }
        }
    }

    private var mutedImagePlaceholder: some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(Color.Theme.card)
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
            .frame(height: 260)
    }

    private struct WizardFooterCapsuleStyle: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.Theme.primaryForeground)
                .background(
                    Capsule().fill(Color.Theme.foreground)
                )
                .opacity(configuration.isPressed ? 0.9 : 1.0)
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
