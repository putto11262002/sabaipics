//  SonyWiFiQRCode.swift
//  FrameFast
//
//  Parses Sony camera WiFi QR payloads shown for Imaging Edge Mobile.
//

import Foundation

struct SonyWiFiQRCode: Codable, Equatable {
    let ssidSuffix: String
    let password: String
    let cameraModel: String
    let cameraId: String?

    var ssid: String {
        // Sony conventions observed on-camera / in QR payloads:
        // - Imaging Edge era: S:<suffix> (e.g. cWE1) and C:<model> (e.g. ILCE-7RM4)
        //   => DIRECT-<suffix>:<model>
        // - Newer payloads: S:<full SSID> (e.g. DIRECT-5HU1:ILCE-7M5)
        if ssidSuffix.hasPrefix("DIRECT-") {
            return ssidSuffix
        }

        return "DIRECT-\(ssidSuffix):\(cameraModel)"
    }

    static func parse(_ raw: String) -> SonyWiFiQRCode? {
        // Observed format:
        // W01:S:cWE1;P:MQGMTeKr;C:ILCE-7RM4;M:D44DA4344543;
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("W01:") else { return nil }

        var ssidSuffix: String?
        var password: String?
        var cameraModel: String?
        var cameraId: String?

        // Split by ';' and parse key:value pairs (key may be prefixed by W01:)
        let parts = trimmed.split(separator: ";", omittingEmptySubsequences: true)
        for partSub in parts {
            let part = String(partSub)
            let normalized: String
            if part.hasPrefix("W01:") {
                normalized = String(part.dropFirst(4))
            } else {
                normalized = part
            }

            // Expect e.g. "S:cWE1"
            let kv = normalized.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            guard kv.count == 2 else { continue }
            let key = String(kv[0])
            let value = String(kv[1])

            switch key {
            case "S": ssidSuffix = value
            case "P": password = value
            case "C": cameraModel = value
            case "M": cameraId = value
            default:
                break
            }
        }

        guard let ssidSuffix, let password, let cameraModel else {
            return nil
        }

        return SonyWiFiQRCode(
            ssidSuffix: ssidSuffix,
            password: password,
            cameraModel: cameraModel,
            cameraId: cameraId
        )
    }
}
