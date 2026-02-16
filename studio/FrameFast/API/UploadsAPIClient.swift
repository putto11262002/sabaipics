//  UploadsAPIClient.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation
import Clerk

struct APIErrorEnvelope: Decodable, Sendable {
    struct Payload: Decodable, Sendable {
        let code: ApiErrorCode
        let message: String
    }

    let error: Payload
}

enum UploadsAPIError: Error, LocalizedError {
    case notAuthenticated
    case invalidURL
    case noToken
    case transport(underlying: Error)
    case decoding(underlying: Error, bodySnippet: String?)
    case api(statusCode: Int, code: ApiErrorCode, message: String?, retryAfterSeconds: Int?)

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
        case .decoding(let underlying, _):
            return "Failed to decode response: \(underlying.localizedDescription)"
        case .api(let statusCode, let code, let message, _):
            let suffix = [code.rawValue, message].compactMap { $0 }.joined(separator: ": ")
            return suffix.isEmpty ? "HTTP \(statusCode)" : "HTTP \(statusCode): \(suffix)"
        }
    }

    var retryAfterSeconds: Int? {
        if case .api(_, _, _, let retryAfterSeconds) = self {
            return retryAfterSeconds
        }
        return nil
    }

    var isRetryable: Bool {
        switch self {
        case .api(let statusCode, let code, _, _):
            switch code {
            case .rateLimited, .internalError, .badGateway, .serviceUnavailable:
                return true
            case .unknown:
                if statusCode == 429 { return true }
                if (500...599).contains(statusCode) { return true }
                return false
            default:
                return false
            }

        case .transport:
            return true

        case .decoding:
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
            "source": "ios",
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
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw UploadsAPIError.transport(underlying: error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw UploadsAPIError.transport(underlying: URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let envelope = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
            let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }
            let responseBody = String(data: data, encoding: .utf8)
            if let responseBody {
                print("[UploadsAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            throw UploadsAPIError.api(
                statusCode: httpResponse.statusCode,
                code: envelope?.error.code ?? .unknown("UNKNOWN"),
                message: envelope?.error.message ?? responseBody,
                retryAfterSeconds: retryAfter
            )
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            let responseBody = String(data: data, encoding: .utf8)
            throw UploadsAPIError.decoding(underlying: error, bodySnippet: responseBody)
        }
    }
}
