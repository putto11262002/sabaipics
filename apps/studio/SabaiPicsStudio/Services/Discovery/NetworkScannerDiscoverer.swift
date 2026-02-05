//  NetworkScannerDiscoverer.swift
//  SabaiPicsStudio
//
//  Adapter that reuses NetworkScannerService for probing.
//

import Combine
import Foundation

@MainActor
final class NetworkScannerDiscoverer: CameraDiscovering, DiscoveryDiagnosticsProviding {
    private let scanner: NetworkScannerService

    init() {
        self.scanner = NetworkScannerService()
    }

    init(scanner: NetworkScannerService) {
        self.scanner = scanner
    }

    var camerasPublisher: AnyPublisher<[DiscoveredCamera], Never> {
        scanner.$discoveredCameras.eraseToAnyPublisher()
    }

    var statePublisher: AnyPublisher<NetworkScannerState, Never> {
        scanner.$state.eraseToAnyPublisher()
    }

    var diagnosticsPublisher: AnyPublisher<DiscoveryDiagnostics?, Never> {
        scanner.$lastDiscoveryDiagnostics.eraseToAnyPublisher()
    }

    func startScan(plan: DiscoveryScanPlan) {
        scanner.startScan(candidateIPs: plan.candidateIPs, perIPTimeout: plan.perIPTimeout)
    }

    func stopScan() {
        scanner.stopScan()
    }

    func cleanup() async {
        await scanner.cleanup()
    }
}
