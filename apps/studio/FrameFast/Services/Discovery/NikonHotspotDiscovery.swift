//  NikonHotspotDiscovery.swift
//  FrameFast
//
//  Nikon hotspot-mode discovery helpers.
//

import Foundation

enum NikonHotspotDiscovery {
    /// IPs to scan when connected to a Nikon camera's WiFi/hotspot.
    ///
    /// Heuristic:
    /// - Prefer previously working IP for this network (if any)
    /// - Scan the first ~10 addresses in the current WiFi subnet
    /// - Include common router defaults as fallback
    static func candidateIPs(preferredIP: String? = nil) -> [String] {
        var candidates: [String] = []

        if let preferredIP {
            candidates.append(preferredIP)
        }

        // Cached IP for the current WiFi network signature
        if let record = APCameraConnectionStore.shared.loadCurrentNetworkRecord(manufacturer: .nikon) {
            candidates.append(record.lastKnownCameraIP)
        }

        // Subnet-based candidates
        if let wifi = WiFiNetworkInfo.currentWiFiIPv4() {
            let base = wifi.subnetBase
            // Common camera hotspots are /24 and use .1 for the camera/router.
            for i in 1...10 {
                candidates.append(WiFiNetworkInfo.ipv4String(from: base &+ UInt32(i)))
            }
        }

        // Common router defaults
        candidates.append("192.168.1.1")
        candidates.append("192.168.0.1")
        candidates.append("192.168.122.1")

        // De-dupe while preserving order
        var seen = Set<String>()
        return candidates.filter { seen.insert($0).inserted }
    }
}
