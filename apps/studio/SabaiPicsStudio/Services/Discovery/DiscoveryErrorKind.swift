//  DiscoveryErrorKind.swift
//  SabaiPicsStudio
//
//  Typed discovery error taxonomy for shared camera discovery flows.
//

import Foundation

enum DiscoveryErrorKind: Equatable {
    case localNetworkDenied
    case notOnLocalNetwork
    case timeout
    case scannerError(String)
    case unknown(String)
}

enum CameraDiscoveryPreflightResult: Equatable {
    case ok
    case needsNetworkHelp(DiscoveryErrorKind)
}

extension DiscoveryErrorKind {
    var userFacingMessage: String {
        switch self {
        case .localNetworkDenied:
            return "Local Network access is required to find cameras."
        case .notOnLocalNetwork:
            return "Connect to the camera WiFi or hotspot, then try again."
        case .timeout:
            return "Camera not found. Try again or enter the IP manually."
        case .scannerError(let message):
            return message
        case .unknown(let message):
            return message
        }
    }
}
