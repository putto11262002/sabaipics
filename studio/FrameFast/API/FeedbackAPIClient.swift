//
//  FeedbackAPIClient.swift
//  FrameFast
//
//  Created: 2026-02-26
//

import Foundation
import Clerk

enum FeedbackCategory: String, CaseIterable, Codable {
    case general = "general"
    case suggestion = "suggestion"
    case featureRequest = "feature_request"

    var displayName: String {
        switch self {
        case .general: return "General"
        case .suggestion: return "Suggestion"
        case .featureRequest: return "Feature Request"
        }
    }
}

enum FeedbackAPIError: Error, LocalizedError {
    case notAuthenticated
    case invalidURL
    case noToken
    case transport(underlying: Error)
    case decoding(underlying: Error)
    case api(statusCode: Int, message: String?)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated"
        case .invalidURL:
            return "Invalid URL"
        case .noToken:
            return "No authentication token available"
        case .transport(let underlying):
            return "Network error: \(underlying.localizedDescription)"
        case .decoding(let underlying):
            return "Failed to decode response: \(underlying.localizedDescription)"
        case .api(let statusCode, let message):
            if let message {
                return "HTTP \(statusCode): \(message)"
            }
            return "HTTP \(statusCode)"
        }
    }
}

struct FeedbackSubmitResponse: Decodable, Sendable {
    struct DataPayload: Decodable, Sendable {
        let id: String
        let content: String
        let category: String
        let source: String
        let createdAt: String
    }
    let data: DataPayload
}

actor FeedbackAPIClient {
    private let baseURL: String

    init(baseURL: String) {
        self.baseURL = baseURL
    }

    func submit(content: String, category: FeedbackCategory) async throws -> FeedbackSubmitResponse.DataPayload {
        guard let url = URL(string: "\(baseURL)/feedback") else {
            throw FeedbackAPIError.invalidURL
        }

        var request = try await buildAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "content": content,
            "category": category.rawValue,
            "source": "ios"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let response: FeedbackSubmitResponse = try await performRequest(request: request)
        return response.data
    }

    // MARK: - Private

    private func buildAuthenticatedRequest(url: URL) async throws -> URLRequest {
        let session = await MainActor.run { Clerk.shared.session }

        guard let session else {
            throw FeedbackAPIError.notAuthenticated
        }

        guard let token = try await session.getToken() else {
            throw FeedbackAPIError.noToken
        }

        let jwt = token.jwt

        var request = URLRequest(url: url)
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func performRequest<T: Decodable>(request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw FeedbackAPIError.transport(underlying: error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw FeedbackAPIError.transport(underlying: URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)
            let responseBody = String(data: data, encoding: .utf8)
            if let responseBody {
                print("[FeedbackAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            throw FeedbackAPIError.api(
                statusCode: httpResponse.statusCode,
                message: errorMessage?["message"] ?? responseBody
            )
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw FeedbackAPIError.decoding(underlying: error)
        }
    }
}
