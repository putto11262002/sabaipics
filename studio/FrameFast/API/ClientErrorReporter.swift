//
//  ClientErrorReporter.swift
//  FrameFast
//

import Foundation

enum ClientErrorReporter {
    private struct Payload: Encodable {
        let platform: String
        let sourceService: String
        let errorType: String
        let message: String
        let stack: String?
        let handled: Bool
        let severity: String
        let route: String?
        let release: String?
        let traceparent: String?
        let baggage: String?
        let metadata: [String: String]?
    }

    static func reportNonFatal(
        baseURL: String,
        request: URLRequest?,
        errorType: String,
        message: String,
        error: Error?,
        metadata: [String: String] = [:]
    ) {
        Task.detached(priority: .utility) {
            await send(
                baseURL: baseURL,
                request: request,
                errorType: errorType,
                message: message,
                error: error,
                metadata: metadata
            )
        }
    }

    private static func send(
        baseURL: String,
        request: URLRequest?,
        errorType: String,
        message: String,
        error: Error?,
        metadata: [String: String]
    ) async {
        guard let url = URL(string: "\(baseURL)/observability/client-errors") else { return }

        let normalizedMessage = String(message.prefix(2_000))
        let stackText = error.map { String(String(reflecting: $0).prefix(16_000)) }
        let route = request?.url?.path
        let release = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let traceparent = request?.value(forHTTPHeaderField: "traceparent")
        let baggage = request?.value(forHTTPHeaderField: "baggage")
        let payload = Payload(
            platform: "ios",
            sourceService: "framefast-ios",
            errorType: String(errorType.prefix(64)),
            message: normalizedMessage,
            stack: stackText,
            handled: true,
            severity: "error",
            route: route,
            release: release,
            traceparent: traceparent,
            baggage: baggage,
            metadata: metadata.isEmpty ? nil : metadata
        )

        var post = URLRequest(url: url)
        post.httpMethod = "POST"
        post.setValue("application/json", forHTTPHeaderField: "Content-Type")
        post.timeoutInterval = 5

        do {
            post.httpBody = try JSONEncoder().encode(payload)
            _ = try await URLSession.shared.data(for: post)
        } catch {
            // Never throw from reporter path.
        }
    }
}
