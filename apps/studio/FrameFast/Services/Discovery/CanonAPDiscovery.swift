//  CanonAPDiscovery.swift
//  FrameFast
//
//  Canon AP-mode discovery helpers.
//

import Foundation

enum CanonAPDiscovery {
    static let ptpIPPort: UInt16 = 15740

    static func candidateIPs(preferredIP: String? = nil) -> [String] {
        var candidates: [String] = []

        if let preferredIP {
            candidates.append(preferredIP)
        }

        // 1) Cached IP for the current WiFi network signature
        if let record = APCameraConnectionStore.shared.loadCurrentNetworkRecord(manufacturer: .canon) {
            candidates.append(record.lastKnownCameraIP)
        }

        // 2) Subnet-based candidates from current WiFi interface
        if let wifi = WiFiNetworkInfo.currentWiFiIPv4() {
            // Most camera hotspots use a /24.
            // For other masks, this still gives a consistent base + offset guess.
            let base = wifi.subnetBase
            let basePlus1 = base &+ 1
            let basePlus2 = base &+ 2

            candidates.append(WiFiNetworkInfo.ipv4String(from: basePlus1))
            candidates.append(WiFiNetworkInfo.ipv4String(from: basePlus2))
        }

        // 3) Known Canon AP defaults
        candidates.append("192.168.122.1")
        candidates.append("192.168.1.1")
        candidates.append("192.168.0.1")

        // De-dupe while preserving order
        var seen = Set<String>()
        return candidates.filter { seen.insert($0).inserted }
    }

    static func isCanonCameraName(_ name: String) -> Bool {
        let lower = name.lowercased()
        return lower.contains("canon") || lower.contains("powershot") || lower.contains("eos")
    }
}
