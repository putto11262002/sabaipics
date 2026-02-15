//  SonyWiFiJoinViewModel.swift
//  FrameFast
//
//  Shared view model used by both Sony QR join and manual SSID join.
//  Responsibilities:
//  - Optionally parse Sony WiFi QR payloads (W01)
//  - Join WiFi via WiFiJoinServicing
//  - Wait for WiFi IPv4
//  - Persist best-effort metadata for later record creation (SSID/cameraId)
//

import Foundation

final class SonyWiFiJoinViewModel: ObservableObject {
    enum Step: Equatable {
        case intro
        case joining
        case connectivityGuide
    }

    @Published var step: Step
    @Published var isJoining: Bool = false
    @Published var errorMessage: String?

    // Manual entry
    @Published var ssid: String = ""
    @Published var password: String = ""

    // QR context (for UI display)
    @Published var qrPayload: SonyWiFiQRCode?
    @Published var qrError: String?

    struct JoinInfo: Equatable {
        let credentials: WiFiCredentials
        let cameraId: String?
    }

    @Published private(set) var joinInfo: JoinInfo? = nil

    private let joinService: WiFiJoinServicing

    private let joinTimeout: TimeInterval
    private let ipv4WaitTimeout: TimeInterval

    private var joinTask: Task<Void, Never>?

    init(
        step: Step = .intro,
        joinService: WiFiJoinServicing = WiFiJoinService.shared,
        joinTimeout: TimeInterval = 8.0,
        ipv4WaitTimeout: TimeInterval = 3.0
    ) {
        self.step = step
        self.joinService = joinService
        self.joinTimeout = joinTimeout
        self.ipv4WaitTimeout = ipv4WaitTimeout
    }
    
    @MainActor
    func handleScannedQRCode(_ raw: String) {
        qrError = nil
        errorMessage = nil

        guard let parsed = SonyWiFiQRCode.parse(raw) else {
            qrPayload = nil
            qrError = "Unsupported QR code. Please scan the QR shown on the camera WiFi screen."
            step = .intro
            return
        }

        qrPayload = parsed
        step = .joining
        startJoinTask { [weak self] in
            guard let self else { return }
            await self.joinUsingQRCodePayload(parsed)
        }
    }

    @MainActor
    func joinFromManualInput() {
        let trimmedSSID = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSSID.isEmpty else {
            errorMessage = "SSID is required."
            return
        }

        ssid = trimmedSSID
        password = trimmedPassword
        errorMessage = nil
        qrError = nil
        qrPayload = nil

        step = .joining
        startJoinTask { [weak self] in
            guard let self else { return }
            await self.join(ssid: trimmedSSID, password: trimmedPassword, cameraId: nil)
        }
    }

    @MainActor
    func retry() {
        errorMessage = nil
        if let qrPayload {
            step = .joining
            startJoinTask { [weak self] in
                guard let self else { return }
                await self.joinUsingQRCodePayload(qrPayload)
            }
            return
        }

        if !ssid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            step = .joining
            startJoinTask { [weak self] in
                guard let self else { return }
                await self.join(ssid: self.ssid, password: self.password, cameraId: nil)
            }
            return
        }

        step = .intro
    }

    @MainActor
    private func joinUsingQRCodePayload(_ qr: SonyWiFiQRCode) async {
        await join(ssid: qr.ssid, password: qr.password, cameraId: qr.cameraId)
    }

    @MainActor
    private func join(ssid: String, password: String, cameraId: String?) async {
        isJoining = true
        errorMessage = nil
        joinInfo = nil

        do {
            try await joinService.join(ssid: ssid, password: password, joinOnce: false, timeout: joinTimeout)
            guard await joinService.waitForWiFiIPv4(timeout: ipv4WaitTimeout, pollInterval: 0.2) != nil else {
                throw WiFiJoinServiceError.timeout
            }

            joinInfo = JoinInfo(credentials: WiFiCredentials(ssid: ssid, password: password.isEmpty ? nil : password), cameraId: cameraId)

            isJoining = false
            step = .connectivityGuide
        } catch {
            isJoining = false
            step = .joining

            if let err = error as? WiFiJoinServiceError, err == .timeout {
                errorMessage = "Could not join WiFi automatically (timed out). Join the camera WiFi, then try again."
                return
            }

            errorMessage = "Could not join WiFi automatically. Join the camera WiFi, then try again. (\(error.localizedDescription))"
        }
    }

    @MainActor
    func cancelJoin() {
        joinTask?.cancel()
        joinTask = nil
        isJoining = false
    }

    @MainActor
    private func startJoinTask(_ op: @escaping () async -> Void) {
        joinTask?.cancel()
        joinTask = Task { await op() }
    }
}
