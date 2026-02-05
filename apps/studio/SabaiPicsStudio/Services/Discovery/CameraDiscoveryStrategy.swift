//  CameraDiscoveryStrategy.swift
//  SabaiPicsStudio
//
//  Shared discovery policy protocol (scan plan + auto-select + preflight).
//

import Foundation

enum CameraDiscoveryPreflightResult: Equatable {
    case ok
    case needsNetworkHelp(DiscoveryErrorKind)
}

protocol CameraDiscoveryStrategizing {
    func preflight() -> CameraDiscoveryPreflightResult
    func makeScanPlan(preferredIP: String?) -> DiscoveryScanPlan
    func autoSelectCamera(from cameras: [DiscoveredCamera]) -> DiscoveredCamera?
}
