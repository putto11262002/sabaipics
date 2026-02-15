//  DiscoveryScanPlan.swift
//  FrameFast
//
//  Simple scan plan abstraction used by manufacturer strategies.
//

import Foundation

struct DiscoveryScanPlan: Equatable {
    let candidateIPs: [String]
    let perIPTimeout: TimeInterval

    init(candidateIPs: [String], perIPTimeout: TimeInterval) {
        self.candidateIPs = candidateIPs
        self.perIPTimeout = perIPTimeout
    }
}
