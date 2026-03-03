//
//  EventsAPIClient.swift
//  FrameFast
//
//  Created: 2026-01-29
//

import Foundation
import Clerk

enum APIError: Error, LocalizedError {
    case notAuthenticated
    case invalidURL
    case noToken
    case networkError(Error)
    case decodingError(Error)
    case httpError(statusCode: Int, message: String?)

    var isAuthError: Bool {
        switch self {
        case .notAuthenticated, .noToken:
            return true
        case .httpError(statusCode: 401, _):
            return true
        default:
            return false
        }
    }

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated"
        case .invalidURL:
            return "Invalid URL"
        case .noToken:
            return "No authentication token available"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .httpError(let statusCode, let message):
            return "HTTP \(statusCode): \(message ?? "Unknown error")"
        }
    }
}

actor EventsAPIClient {
    private let baseURL: String

    init(baseURL: String) {
        self.baseURL = baseURL
    }

    // MARK: - Public Methods

    func fetchEvents(page: Int = 0, limit: Int = 10) async throws -> EventsResponse {
        guard let url = URL(string: "\(baseURL)/events?page=\(page)&limit=\(limit)") else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_invalid_url",
                message: "Invalid URL for fetchEvents",
                error: APIError.invalidURL,
                metadata: ["client": "events_api"]
            )
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func fetchEvent(id: String) async throws -> EventResponse {
        guard let url = URL(string: "\(baseURL)/events/\(id)") else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_invalid_url",
                message: "Invalid URL for fetchEvent",
                error: APIError.invalidURL,
                metadata: ["client": "events_api"]
            )
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func updateEvent(id: String, input: UpdateEventInput) async throws -> EventResponse {
        guard let url = URL(string: "\(baseURL)/events/\(id)") else {
            throw APIError.invalidURL
        }

        var request = try await buildAuthenticatedRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(input)
        return try await performRequest(request: request)
    }

    func fetchFtpCredentials(eventId: String) async throws -> FtpCredentials {
        guard let url = URL(string: "\(baseURL)/api/ftp/events/\(eventId)/ftp-credentials") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func revealFtpPassword(eventId: String) async throws -> FtpRevealData {
        guard let url = URL(string: "\(baseURL)/api/ftp/events/\(eventId)/ftp-credentials/reveal") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func fetchImagePipeline(eventId: String) async throws -> ImagePipelineResponse {
        guard let url = URL(string: "\(baseURL)/events/\(eventId)/image-pipeline") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func updateImagePipeline(eventId: String, input: UpdateImagePipelineInput) async throws -> ImagePipelineResponse {
        guard let url = URL(string: "\(baseURL)/events/\(eventId)/image-pipeline") else {
            throw APIError.invalidURL
        }

        var request = try await buildAuthenticatedRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(input)
        return try await performRequest(request: request)
    }

    // MARK: - Studio

    func fetchAutoEditPresets(limit: Int = 200) async throws -> AutoEditPresetsResponse {
        guard let url = URL(string: "\(baseURL)/studio/auto-edit?limit=\(limit)") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func fetchStudioLuts(limit: Int = 200) async throws -> StudioLutsResponse {
        guard let url = URL(string: "\(baseURL)/studio/luts?limit=\(limit)") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    // MARK: - Private Methods

    private func buildAuthenticatedRequest(url: URL) async throws -> URLRequest {
        let session = await MainActor.run { Clerk.shared.session }

        guard let session = session else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_not_authenticated",
                message: "Clerk session missing",
                error: APIError.notAuthenticated,
                metadata: ["client": "events_api", "route": url.path]
            )
            throw APIError.notAuthenticated
        }

        let token: TokenResource?
        do {
            token = try await session.getToken()
        } catch {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_token_fetch_failed",
                message: "Failed to fetch Clerk token",
                error: error,
                metadata: ["client": "events_api", "route": url.path]
            )
            throw APIError.notAuthenticated
        }

        guard let token else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_no_token",
                message: "Token was nil after Clerk fetch",
                error: APIError.noToken,
                metadata: ["client": "events_api", "route": url.path]
            )
            throw APIError.noToken
        }

        let jwt = token.jwt

        var request = URLRequest(url: url)
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        TraceContext.applyClientTraceHeaders(to: &request, client: "ios", route: url.path)

        return request
    }

    private func performRequest<T: Decodable>(request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_transport_error",
                message: "Network transport error in EventsAPI",
                error: error,
                metadata: ["client": "events_api"]
            )
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_bad_response",
                message: "Non-HTTP response in EventsAPI",
                error: APIError.networkError(URLError(.badServerResponse)),
                metadata: ["client": "events_api"]
            )
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to decode error message from response
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)

            // Log error responses for debugging
            if let responseBody = String(data: data, encoding: .utf8) {
                print("[EventsAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            if httpResponse.statusCode == 401 {
                ClientErrorReporter.reportNonFatal(
                    baseURL: baseURL,
                    request: request,
                    errorType: "ios_api_http_401",
                    message: "HTTP 401 in EventsAPI",
                    error: APIError.notAuthenticated,
                    metadata: ["client": "events_api", "status_code": "401"]
                )
                throw APIError.notAuthenticated
            }

            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_http_error",
                message: "HTTP \(httpResponse.statusCode) in EventsAPI",
                error: APIError.httpError(
                    statusCode: httpResponse.statusCode,
                    message: errorMessage?["message"]
                ),
                metadata: ["client": "events_api", "status_code": String(httpResponse.statusCode)]
            )
            throw APIError.httpError(
                statusCode: httpResponse.statusCode,
                message: errorMessage?["message"]
            )
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_decode_error",
                message: "Decode error in EventsAPI",
                error: error,
                metadata: ["client": "events_api"]
            )
            throw APIError.decodingError(error)
        }
    }
}
