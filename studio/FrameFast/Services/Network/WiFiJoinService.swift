//  WiFiJoinService.swift
//  FrameFast
//
//  Generic WiFi join helper built on NEHotspotConfiguration.
//  Intentionally does not read SSID/BSSID (permissions/entitlements).
//

import Foundation
#if os(iOS)
import NetworkExtension
import os
#endif

protocol WiFiJoinServicing {
    /// Attempts to join a WiFi network by SSID.
    /// - Note: Password is optional for open networks.
    func join(ssid: String, password: String?, joinOnce: Bool, timeout: TimeInterval) async throws

    /// Best-effort wait until WiFi IPv4 is available.
    func waitForWiFiIPv4(timeout: TimeInterval, pollInterval: TimeInterval) async -> WiFiIPv4Info?
}

enum WiFiJoinServiceError: Error, Equatable {
    case timeout
}

final class WiFiJoinService: WiFiJoinServicing {
    static let shared = WiFiJoinService()

    private init() {}

    func join(ssid: String, password: String?, joinOnce: Bool, timeout: TimeInterval) async throws {
#if os(iOS)
        let trimmedSSID = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password?.trimmingCharacters(in: .whitespacesAndNewlines)

        let config: NEHotspotConfiguration
        if let trimmedPassword, !trimmedPassword.isEmpty {
            config = NEHotspotConfiguration(ssid: trimmedSSID, passphrase: trimmedPassword, isWEP: false)
        } else {
            config = NEHotspotConfiguration(ssid: trimmedSSID)
        }
        config.joinOnce = joinOnce

        try await applyHotspotConfiguration(config, timeout: timeout)
#else
        _ = (ssid, password, joinOnce, timeout)
        throw NSError(domain: "WiFiJoinService", code: 1, userInfo: [NSLocalizedDescriptionKey: "WiFi join is only supported on iOS."])
#endif
    }

    func waitForWiFiIPv4(timeout: TimeInterval, pollInterval: TimeInterval) async -> WiFiIPv4Info? {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if let info = WiFiNetworkInfo.currentWiFiIPv4() {
                return info
            }
            try? await Task.sleep(nanoseconds: UInt64(max(0.05, pollInterval) * 1_000_000_000))
        }
        return nil
    }

#if os(iOS)
    private func applyHotspotConfiguration(_ config: NEHotspotConfiguration, timeout: TimeInterval) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            // Use the lock's stored state to avoid capturing mutable vars across closures.
            let lock = OSAllocatedUnfairLock(initialState: false)

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
                let shouldResume = lock.withLock { didResume -> Bool in
                    guard didResume == false else { return false }
                    didResume = true
                    return true
                }
                if shouldResume {
                    cont.resume(throwing: WiFiJoinServiceError.timeout)
                }
            }

            Task { @MainActor in
                NEHotspotConfigurationManager.shared.apply(config) { error in
                    let shouldResume = lock.withLock { didResume -> Bool in
                        guard didResume == false else { return false }
                        didResume = true
                        return true
                    }
                    guard shouldResume else {
                        return
                    }

                    if let error {
                        // If we're already connected to this SSID, treat as success.
                        if self.isAlreadyAssociated(error) {
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
        let ns = error as NSError
        if ns.domain == NEHotspotConfigurationErrorDomain,
           ns.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
            return true
        }
        return false
    }
#endif
}
