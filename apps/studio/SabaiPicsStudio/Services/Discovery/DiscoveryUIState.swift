//  DiscoveryUIState.swift
//  SabaiPicsStudio
//
//  Typed UI state for shared discovery screens.
//

import Foundation

enum DiscoveryUIState: Equatable {
    case scanning
    case needsNetworkHelp
    case timedOut
    case error(DiscoveryErrorKind)
    case found
}
