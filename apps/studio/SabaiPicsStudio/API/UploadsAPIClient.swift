//  UploadsAPIClient.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation
import Clerk

// Uses APIError from EventsAPIClient.swift

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
            throw APIError.invalidURL
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
            throw APIError.invalidURL
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
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        let response: UploadStatusResponse = try await performRequest(request: request)
        return response.data
    }

    // MARK: - Shared helpers (mirrors EventsAPIClient)

    private func buildAuthenticatedRequest(url: URL) async throws -> URLRequest {
        let session = await MainActor.run { Clerk.shared.session }

        guard let session else {
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
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)
            if let responseBody = String(data: data, encoding: .utf8) {
                print("[UploadsAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: errorMessage?["message"])
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
