//
//  EventsAPIClient.swift
//  SabaiPicsStudio
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
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    func fetchEvent(id: String) async throws -> EventResponse {
        guard let url = URL(string: "\(baseURL)/events/\(id)") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        return try await performRequest(request: request)
    }

    // MARK: - Private Methods

    private func buildAuthenticatedRequest(url: URL) async throws -> URLRequest {
        let session = await MainActor.run { Clerk.shared.session }

        guard let session = session else {
            throw APIError.notAuthenticated
        }

        guard let token = try await session.getToken() else {
            throw APIError.noToken
        }

        let jwt = token.jwt

        var request = URLRequest(url: url)
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        return request
    }

    private func performRequest<T: Decodable>(request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to decode error message from response
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)

            // Log error responses for debugging
            if let responseBody = String(data: data, encoding: .utf8) {
                print("[EventsAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            throw APIError.httpError(
                statusCode: httpResponse.statusCode,
                message: errorMessage?["message"]
            )
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
