//  CameraDiscoverer.swift
//  SabaiPicsStudio
//
//  Protocol wrapper around discovery probing.
//

import Combine
import Foundation

@MainActor
protocol CameraDiscovering: AnyObject {
    var camerasPublisher: AnyPublisher<[DiscoveredCamera], Never> { get }
    var statePublisher: AnyPublisher<NetworkScannerState, Never> { get }

    func startScan(plan: DiscoveryScanPlan)
    func stopScan()
    func cleanup() async
}
