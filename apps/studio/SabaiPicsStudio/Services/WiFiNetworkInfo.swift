//  WiFiNetworkInfo.swift
//  SabaiPicsStudio
//
//  Lightweight helpers for reading the current WiFi IPv4 + subnet mask.
//  Used for Sony AP-mode discovery (no multicast/SSDP).
//

import Foundation

struct WiFiIPv4Info: Equatable {
    let ip: UInt32
    let netmask: UInt32

    var ipString: String { WiFiNetworkInfo.ipv4String(from: ip) }
    var netmaskString: String { WiFiNetworkInfo.ipv4String(from: netmask) }

    var subnetBase: UInt32 { ip & netmask }
    var subnetBaseString: String { WiFiNetworkInfo.ipv4String(from: subnetBase) }
}

enum WiFiNetworkInfo {
    /// Returns WiFi-ish IPv4 + netmask.
    ///
    /// - Prefers `en0` (WiFi).
    /// - Falls back to `bridge100` (iPhone Personal Hotspot).
    ///
    /// Note: This does not provide SSID. SSID generally requires additional
    /// entitlements/permissions and is intentionally not relied on here.
    static func currentWiFiIPv4() -> WiFiIPv4Info? {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
            return nil
        }
        defer { freeifaddrs(ifaddr) }

        // We walk the list multiple times to enforce interface preference.
        for preferredName in ["en0", "bridge100"] {
            var addr = firstAddr
            while true {
                let name = String(cString: addr.pointee.ifa_name)
                if name == preferredName,
                   let sa = addr.pointee.ifa_addr,
                   sa.pointee.sa_family == UInt8(AF_INET) {
                    let ip = sockaddrInToUInt32(sa)
                    let mask: UInt32
                    if let nm = addr.pointee.ifa_netmask {
                        mask = sockaddrInToUInt32(nm)
                    } else {
                        mask = 0
                    }

                    if ip != 0 {
                        return WiFiIPv4Info(ip: ip, netmask: mask)
                    }
                }

                guard let next = addr.pointee.ifa_next else {
                    break
                }
                addr = next
            }
        }

        return nil
    }

    /// Returns a stable-ish identifier for the current WiFi network without requiring SSID.
    ///
    /// Uses subnet base + netmask as the signature.
    static func currentNetworkKey() -> String? {
        guard let wifi = currentWiFiIPv4() else {
            return nil
        }
        return "subnet:\(wifi.subnetBaseString)/\(wifi.netmaskString)"
    }

    static func ipv4String(from ipv4: UInt32) -> String {
        let a = (ipv4 >> 24) & 0xFF
        let b = (ipv4 >> 16) & 0xFF
        let c = (ipv4 >> 8) & 0xFF
        let d = ipv4 & 0xFF
        return "\(a).\(b).\(c).\(d)"
    }

    private static func sockaddrInToUInt32(_ sa: UnsafePointer<sockaddr>) -> UInt32 {
        let sinPtr = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in.self)
        let raw = sinPtr.pointee.sin_addr.s_addr
        // s_addr is in network byte order
        let hostOrder = UInt32(bigEndian: raw)
        return hostOrder
    }
}
