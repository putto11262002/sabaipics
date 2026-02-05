//  CameraDiscoveryGuidance.swift
//  SabaiPicsStudio
//
//  Shared discovery UI guidance protocol (copy + actions).
//

import Foundation

protocol CameraDiscoveryGuidanceProviding {
    var navigationTitle: String { get }
    var backConfirmation: AppBackConfirmation? { get }

    var primaryActionTitle: String { get }
    var secondaryActionTitle: String? { get }

    func guidance(
        for state: DiscoveryUIState,
        networkHelpKind: DiscoveryErrorKind?,
        timedOutHint: DiscoveryErrorKind?
    ) -> GuidanceModel?
}
