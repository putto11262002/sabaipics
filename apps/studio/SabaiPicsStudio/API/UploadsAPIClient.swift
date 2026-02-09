//  UploadsAPIClient.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation
import Clerk

struct APIErrorEnvelope: Decodable, Sendable {
    struct Payload: Decodable, Sendable {
        let code: String
        let message: String
    }

    let error: Payload
}

enum UploadsAPIError: Error, LocalizedError {
    case notAuthenticated
    case invalidURL
    case noToken
    case networkError(Error)
    case decodingError(Error)
    case http(statusCode: Int, code: String?, message: String?, retryAfterSeconds: Int?)

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
        case .http(let statusCode, let code, let message, _):
            let suffix = [code, message].compactMap { $0 }.joined(separator: ": ")
            return suffix.isEmpty ? "HTTP \(statusCode)" : "HTTP \(statusCode): \(suffix)"
        }
    }

    var isRetryable: Bool {
        switch self {
        case .http(let statusCode, let code, _, _):
            // Prefer semantic API codes when present.
            if let code {
                switch code {
                case "INTERNAL_ERROR", "BAD_GATEWAY", "SERVICE_UNAVAILABLE", "RATE_LIMITED":
                    return true
                default:
                    break
                }
            }

            // Fallback to status code mapping.
            if statusCode == 429 { return true }
            if (500...599).contains(statusCode) { return true }
            return false

        case .networkError:
            return true

        case .decodingError:
            // Usually indicates a backend contract issue; retrying may not help, but don't hard-stop.
            return true

        case .notAuthenticated, .noToken, .invalidURL:
            return false
        }
    }
}

struct UploadPresignResponse: Decodable, Sendable {
    struct DataPayload: Decodable, Sendable {
        let uploadId: String
        let putUrl: String
        let objectKey: String
        let expiresAt: String
        let requiredHeaders: [String: String]
    }
    let data: DataPayload
}

struct UploadStatusResponse: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        let uploadId: String
        let eventId: String
        let status: String
        let errorCode: String?
        let errorMessage: String?
        let photoId: String?
        let uploadedAt: String?
        let completedAt: String?
        let expiresAt: String
    }

    let data: [Item]
}

actor UploadsAPIClient {
    private let baseURL: String

    init(baseURL: String) {
        self.baseURL = baseURL
    }

    func presign(eventId: String, contentType: String, contentLength: Int, filename: String?) async throws -> UploadPresignResponse.DataPayload {
        guard let url = URL(string: "\(baseURL)/uploads/presign") else {
            throw UploadsAPIError.invalidURL
        }

        var request = try await buildAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "eventId": eventId,
            "contentType": contentType,
            "contentLength": contentLength,
        ]
        if let filename {
            body["filename"] = filename
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let response: UploadPresignResponse = try await performRequest(request: request)
        return response.data
    }

    func repressign(uploadId: String) async throws -> UploadPresignResponse.DataPayload {
        guard let url = URL(string: "\(baseURL)/uploads/\(uploadId)/presign") else {
            throw UploadsAPIError.invalidURL
        }

        var request = try await buildAuthenticatedRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let response: UploadPresignResponse = try await performRequest(request: request)
        return response.data
    }

    func fetchStatus(uploadIds: [String]) async throws -> [UploadStatusResponse.Item] {
        let ids = uploadIds.joined(separator: ",")
        guard let url = URL(string: "\(baseURL)/uploads/status?ids=\(ids)") else {
            throw UploadsAPIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        let response: UploadStatusResponse = try await performRequest(request: request)
        return response.data
    }

    // MARK: - Shared helpers (mirrors EventsAPIClient)

    private func buildAuthenticatedRequest(url: URL) async throws -> URLRequest {
        let session = await MainActor.run { Clerk.shared.session }

        guard let session else {
            throw UploadsAPIError.notAuthenticated
        }

        guard let token = try await session.getToken() else {
            throw UploadsAPIError.noToken
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
            throw UploadsAPIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let envelope = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
            let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }
            if let responseBody = String(data: data, encoding: .utf8) {
                print("[UploadsAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            throw UploadsAPIError.http(
                statusCode: httpResponse.statusCode,
                code: envelope?.error.code,
                message: envelope?.error.message,
                retryAfterSeconds: retryAfter
            )
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            throw UploadsAPIError.decodingError(error)
        }
    }
}
