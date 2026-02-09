//  CanonHotspotDiscovery.swift
//  FrameFast
//
//  Canon hotspot-mode discovery helpers.
//

import Foundation

enum CanonHotspotDiscovery {
    /// IPs to scan on the iPhone Personal Hotspot subnet (172.20.10.2–20).
    static func candidateIPs() -> [String] {
        var candidates: [String] = []

        // Cached IP from previous connection
        if let record = APCameraConnectionStore.shared.loadCurrentNetworkRecord(manufacturer: .canon) {
            candidates.append(record.lastKnownCameraIP)
        }

        // Standard Personal Hotspot range
        for i in 2...20 {
            candidates.append("172.20.10.\(i)")
        }

        // De-dupe while preserving order
        var seen = Set<String>()
        return candidates.filter { seen.insert($0).inserted }
    }
}
