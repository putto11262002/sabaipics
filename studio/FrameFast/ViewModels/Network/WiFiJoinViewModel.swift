//  WiFiJoinViewModel.swift
//  FrameFast

import Foundation

@MainActor
final class WiFiJoinViewModel: ObservableObject {
    enum Step: Equatable {
        case joining
        case connectivityGuide
        case error(String)
    }

    @Published private(set) var step: Step = .joining
    @Published private(set) var isJoining: Bool = false

    private let joinService: WiFiJoinServicing
    private let joinTimeout: TimeInterval
    private let ipv4WaitTimeout: TimeInterval

    private var joinTask: Task<Void, Never>?

    let credentials: WiFiCredentials

    init(
        credentials: WiFiCredentials,
        joinService: WiFiJoinServicing = WiFiJoinService.shared,
        joinTimeout: TimeInterval = 8.0,
        ipv4WaitTimeout: TimeInterval = 3.0
    ) {
        self.credentials = credentials
        self.joinService = joinService
        self.joinTimeout = joinTimeout
        self.ipv4WaitTimeout = ipv4WaitTimeout
    }

    func start() {
        cancel()
        step = .joining
        isJoining = true

        let ssid = credentials.ssid
        let password = credentials.password

        joinTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await joinService.join(ssid: ssid, password: password, joinOnce: false, timeout: joinTimeout)
                guard await joinService.waitForWiFiIPv4(timeout: ipv4WaitTimeout, pollInterval: 0.2) != nil else {
                    throw WiFiJoinServiceError.timeout
                }

                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self.isJoining = false
                    self.step = .connectivityGuide
                }
            } catch {
                guard !Task.isCancelled else { return }

                let message: String
                if let err = error as? WiFiJoinServiceError, err == .timeout {
                    message = "Could not join WiFi automatically (timed out). Join the camera WiFi, then try again."
                } else {
                    message = "Could not join WiFi automatically. Join the camera WiFi, then try again. (\(error.localizedDescription))"
                }

                await MainActor.run {
                    self.isJoining = false
                    self.step = .error(message)
                }
            }
        }
    }

    func retry() {
        start()
    }

    func cancel() {
        joinTask?.cancel()
        joinTask = nil
        isJoining = false
    }
}
