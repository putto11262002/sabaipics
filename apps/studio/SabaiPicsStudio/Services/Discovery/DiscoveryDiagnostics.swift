//  DiscoveryDiagnostics.swift
//  SabaiPicsStudio
//
//  Lightweight diagnostics that allow higher layers to map
//  scan outcomes to better guidance (Sony-only for now).
//

import Combine
import Foundation

struct DiscoveryDiagnostics: Equatable {
    let totalTargets: Int
    let foundCount: Int

    let permissionDeniedCount: Int
    let portClosedCount: Int
    let timeoutCount: Int
    let networkUnreachableCount: Int
    let hostUnreachableCount: Int
    let otherFailureCount: Int
}

@MainActor
protocol DiscoveryDiagnosticsProviding: AnyObject {
    var diagnosticsPublisher: AnyPublisher<DiscoveryDiagnostics?, Never> { get }
}
