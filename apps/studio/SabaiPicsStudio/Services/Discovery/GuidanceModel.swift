//  GuidanceModel.swift
//  SabaiPicsStudio
//
//  Generic guidance model used by shared discovery UI.
//

import Foundation

struct GuidanceModel: Equatable {
    let title: String
    let message: String
    let iconSystemName: String?

    let primaryActionTitle: String
    let secondaryActionTitle: String?

    let bullets: [String]

    init(
        title: String,
        message: String,
        iconSystemName: String? = nil,
        primaryActionTitle: String,
        secondaryActionTitle: String? = nil,
        bullets: [String] = []
    ) {
        self.title = title
        self.message = message
        self.iconSystemName = iconSystemName
        self.primaryActionTitle = primaryActionTitle
        self.secondaryActionTitle = secondaryActionTitle
        self.bullets = bullets
    }
}
