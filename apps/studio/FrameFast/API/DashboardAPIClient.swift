//
//  DashboardAPIClient.swift
//  FrameFast
//

import Foundation
import Clerk

actor DashboardAPIClient {
    private let baseURL: String

    init(baseURL: String) {
        self.baseURL = baseURL
    }

    // MARK: - Public Methods

    func fetchCreditBalance() async throws -> Int {
        guard let url = URL(string: "\(baseURL)/dashboard") else {
            throw APIError.invalidURL
        }

        let request = try await buildAuthenticatedRequest(url: url)
        let response: DashboardResponse = try await performRequest(request: request)
        return response.data.credits.balance
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
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)

            if let responseBody = String(data: data, encoding: .utf8) {
                print("[DashboardAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
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

// MARK: - Response Models

private struct DashboardResponse: Decodable {
    let data: DataPayload

    struct DataPayload: Decodable {
        let credits: Credits
    }

    struct Credits: Decodable {
        let balance: Int
    }
}
