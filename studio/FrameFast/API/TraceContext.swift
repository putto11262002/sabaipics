//
//  TraceContext.swift
//  FrameFast
//

import Foundation

enum TraceContext {
    static func applyClientTraceHeaders(
        to request: inout URLRequest,
        client: String,
        route: String? = nil
    ) {
        if request.value(forHTTPHeaderField: "traceparent") == nil {
            request.setValue(makeTraceparent(), forHTTPHeaderField: "traceparent")
        }
        if request.value(forHTTPHeaderField: "baggage") == nil {
            request.setValue(makeBaggage(client: client, route: route), forHTTPHeaderField: "baggage")
        }
    }

    private static func makeTraceparent() -> String {
        let version = "00"
        let traceID = hexID(byteCount: 16)
        let spanID = hexID(byteCount: 8)
        let traceFlags = "01"
        return "\(version)-\(traceID)-\(spanID)-\(traceFlags)"
    }

    private static func makeBaggage(client: String, route: String?) -> String {
        var parts = [
            "app=framefast",
            "client=\(encode(client))",
            "client_platform=ios",
        ]
        if let route, !route.isEmpty {
            parts.append("route=\(encode(route))")
        }
        return parts.joined(separator: ",")
    }

    private static func encode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: ",;=")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func hexID(byteCount: Int) -> String {
        precondition(byteCount > 0)
        var bytes = [UInt8](repeating: 0, count: byteCount)
        for i in 0..<byteCount {
            bytes[i] = UInt8.random(in: .min ... .max)
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
