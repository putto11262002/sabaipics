//  SonyAPSSIDJoinView.swift
//  SabaiPicsStudio
//
//  Join Sony camera WiFi via SSID + password.
//

import SwiftUI
import NetworkExtension
import os

struct SonyAPSSIDJoinView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator

    @State private var ssid: String = ""
    @State private var password: String = ""

    @FocusState private var ssidFocused: Bool
    @FocusState private var passwordFocused: Bool

    @State private var step: Step = .form
    @State private var errorMessage: String?
    @State private var isJoining = false
    @State private var showInternetGuide = false

    private enum Step {
        case form
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
            case .form:
                form
            case .joining:
                joining
            case .networkCheck:
                networkCheck
            }
        }
        .navigationTitle("Enter SSID")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    captureFlow.state = .sonyNewCameraDecision
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .foregroundColor(Color.Theme.primary)
                }
            }
        }
        .sheet(isPresented: $showInternetGuide) {
            SonyInternetGuideView(
                wifiInfo: wifiInfo,
                onSkip: { showInternetGuide = false },
                onDone: { showInternetGuide = false }
            )
        }
    }

    private var form: some View {
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

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.top, 4)
                }

                Spacer(minLength: 12)

                Button("Join WiFi") {
                    Task { await joinTapped() }
                }
                .buttonStyle(.primary)
            }
            .padding(20)
        }
    }

    private var joining: some View {
        VStack(spacing: 14) {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
            Text("Joining WiFi...")
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)
            if !ssid.isEmpty {
                Text(ssid)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Spacer()

            Button("Try Again") {
                step = .form
            }
            .buttonStyle(.secondary)
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
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

            if let wifiInfo {
                VStack(spacing: 8) {
                    Text("WiFi IP: \(wifiInfo.ipString)")
                    Text("Subnet Mask: \(wifiInfo.netmaskString)")
                }
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
            } else {
                Text("WiFi not detected yet. If join succeeded, wait a moment and try again.")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            Button("Continue (Transfer only)") {
                captureFlow.proceedToDiscovery()
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 20)

            Button("Set up Real-time Upload") {
                showInternetGuide = true
            }
            .buttonStyle(.secondary)
            .padding(.horizontal, 20)

            Button("Back") {
                captureFlow.state = .sonyNewCameraDecision
            }
            .buttonStyle(.ghost)
            .padding(.bottom, 24)
        }
        .padding(.horizontal, 20)
    }

    private func joinTapped() async {
        let trimmedSSID = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSSID.isEmpty else {
            errorMessage = "SSID is required."
            return
        }

        ssid = trimmedSSID
        password = trimmedPassword
        errorMessage = nil

        await MainActor.run {
            ssidFocused = false
            passwordFocused = false
        }

        await MainActor.run {
            step = .joining
            isJoining = true
        }

        do {
            let config: NEHotspotConfiguration
            if trimmedPassword.isEmpty {
                config = NEHotspotConfiguration(ssid: trimmedSSID)
            } else {
                config = NEHotspotConfiguration(ssid: trimmedSSID, passphrase: trimmedPassword, isWEP: false)
            }
            config.joinOnce = false

            try await applyHotspotConfiguration(config, timeout: 8.0)

            // Wait briefly for WiFi interface to populate IP.
            for _ in 0..<15 {
                if WiFiNetworkInfo.currentWiFiIPv4() != nil {
                    break
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }

            // Store join metadata (SSID) for later record creation.
            SonyAPConnectionCache.shared.savePendingJoinInfoForCurrentNetwork(ssid: trimmedSSID, cameraId: nil)

            await MainActor.run {
                isJoining = false
                step = .networkCheck
            }
        } catch {
            await MainActor.run {
                isJoining = false
                step = .joining

                if let joinError = error as? JoinError, joinError == .timeout {
                    errorMessage = "Timed out waiting for iOS WiFi join."
                } else {
                    errorMessage = error.localizedDescription
                }
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
                        if isAlreadyAssociated(error) {
                            cont.resume()
                            return
                        }
                        cont.resume(throwing: error)
                        return
                    }

                    cont.resume()
                }
            }
        }
    }

    private func isAlreadyAssociated(_ error: Error) -> Bool {
        if let hsError = error as? NEHotspotConfigurationError, hsError == .alreadyAssociated {
            return true
        }

        let ns = error as NSError
        if ns.domain == NEHotspotConfigurationErrorDomain,
           ns.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
            return true
        }

        return false
    }
}

#Preview {
    NavigationView {
        SonyAPSSIDJoinView()
    }
}
