//  SonyAPDiscoveryStrategy.swift
//  SabaiPicsStudio
//
//  Sony-only strategy/guidance layer for AP-mode discovery.
//

import Foundation

struct SonyAPDiscoveryStrategy: CameraDiscoveryStrategizing {
    let perIPTimeout: TimeInterval

    init(perIPTimeout: TimeInterval = 1.0) {
        self.perIPTimeout = perIPTimeout
    }

    func preflight() -> CameraDiscoveryPreflightResult {
        // Preserve current behavior: if we cannot read WiFi IPv4, show network help UI.
        return WiFiNetworkInfo.currentWiFiIPv4() == nil ? .needsNetworkHelp(.notOnLocalNetwork) : .ok
    }

    func makeScanPlan(preferredIP: String?) -> DiscoveryScanPlan {
        // IMPORTANT: Candidate ordering must match SonyAPDiscovery.candidateIPs.
        DiscoveryScanPlan(
            candidateIPs: SonyAPDiscovery.candidateIPs(preferredIP: preferredIP),
            perIPTimeout: perIPTimeout
        )
    }

    func autoSelectCamera(from cameras: [DiscoveredCamera]) -> DiscoveredCamera? {
        // Prefer explicit user selection.
        return nil
    }
}

extension SonyAPDiscoveryStrategy: CameraDiscoveryGuidanceProviding {
    var navigationTitle: String {
        "Connect Sony"
    }

    var backConfirmation: AppBackConfirmation? {
        AppBackConfirmation(
            title: "Stop connecting?",
            message: "Return to manufacturer selection?"
        )
    }

    var primaryActionTitle: String {
        "Try Again"
    }

    var secondaryActionTitle: String? {
        "Enter IP Manually"
    }

    func guidance(
        for state: DiscoveryUIState,
        networkHelpKind: DiscoveryErrorKind?,
        timedOutHint: DiscoveryErrorKind?
    ) -> GuidanceModel? {
        switch state {
        case .found:
            return nil
        case .scanning:
            return GuidanceModel(
                title: "Looking for your Sony camera...",
                message: "",
                iconSystemName: "camera.viewfinder",
                primaryActionTitle: primaryActionTitle,
                secondaryActionTitle: secondaryActionTitle
            )
        case .needsNetworkHelp:
            let kind = networkHelpKind ?? .notOnLocalNetwork
            switch kind {
            case .localNetworkDenied:
                return GuidanceModel(
                    title: "Allow Local Network access",
                    message: "Enable Local Network in Settings, then try again.",
                    iconSystemName: "network.slash",
                    primaryActionTitle: primaryActionTitle,
                    secondaryActionTitle: secondaryActionTitle,
                    bullets: [
                        "Settings > Privacy & Security > Local Network",
                        "Also confirm you are on the camera WiFi (DIRECT-*)"
                    ]
                )
            case .notOnLocalNetwork:
                return GuidanceModel(
                    title: "Connect to camera WiFi",
                    message: "Join the camera WiFi, then try again.",
                    iconSystemName: "network.slash",
                    primaryActionTitle: primaryActionTitle,
                    secondaryActionTitle: secondaryActionTitle,
                    bullets: [
                        "If the scan still fails, enable Local Network in Settings"
                    ]
                )
            default:
                return GuidanceModel(
                    title: "Connect to camera WiFi",
                    message: "Join the camera WiFi, then try again.",
                    iconSystemName: "network.slash",
                    primaryActionTitle: primaryActionTitle,
                    secondaryActionTitle: secondaryActionTitle
                )
            }
        case .timedOut:
            if let hint = timedOutHint {
                switch hint {
                case .localNetworkDenied:
                    return GuidanceModel(
                        title: "Allow Local Network access",
                        message: "Enable Local Network in Settings, then try again.",
                        iconSystemName: "network.slash",
                        primaryActionTitle: primaryActionTitle,
                        secondaryActionTitle: secondaryActionTitle,
                        bullets: [
                            "Settings > Privacy & Security > Local Network",
                            "Also confirm you are on the camera WiFi (DIRECT-*)"
                        ]
                    )
                case .notOnLocalNetwork:
                    return GuidanceModel(
                        title: "Connect to camera WiFi",
                        message: "Join the camera WiFi, then try again.",
                        iconSystemName: "network.slash",
                        primaryActionTitle: primaryActionTitle,
                        secondaryActionTitle: secondaryActionTitle,
                        bullets: [
                            "If the scan still fails, enable Local Network in Settings"
                        ]
                    )
                default:
                    break
                }
            }

            return GuidanceModel(
                title: "Camera not found",
                message: "Try again or enter the IP manually.",
                iconSystemName: "exclamationmark.triangle",
                primaryActionTitle: primaryActionTitle,
                secondaryActionTitle: secondaryActionTitle
            )
        case .error(let kind):
            return GuidanceModel(
                title: "Connection problem",
                message: kind.userFacingMessage,
                iconSystemName: "exclamationmark.triangle",
                primaryActionTitle: primaryActionTitle,
                secondaryActionTitle: secondaryActionTitle
            )
        }
    }
}
