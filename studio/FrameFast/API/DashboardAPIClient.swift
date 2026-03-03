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
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_invalid_url",
                message: "Invalid URL for fetchCreditBalance",
                error: APIError.invalidURL,
                metadata: ["client": "dashboard_api"]
            )
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
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_not_authenticated",
                message: "Clerk session missing",
                error: APIError.notAuthenticated,
                metadata: ["client": "dashboard_api", "route": url.path]
            )
            throw APIError.notAuthenticated
        }

        guard let token = try await session.getToken() else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: nil,
                errorType: "ios_api_no_token",
                message: "Token was nil after Clerk fetch",
                error: APIError.noToken,
                metadata: ["client": "dashboard_api", "route": url.path]
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
                message: "Network transport error in DashboardAPI",
                error: error,
                metadata: ["client": "dashboard_api"]
            )
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_bad_response",
                message: "Non-HTTP response in DashboardAPI",
                error: APIError.networkError(URLError(.badServerResponse)),
                metadata: ["client": "dashboard_api"]
            )
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorMessage = try? JSONDecoder().decode([String: String].self, from: data)

            if let responseBody = String(data: data, encoding: .utf8) {
                print("[DashboardAPI Error] HTTP \(httpResponse.statusCode): \(responseBody)")
            }

            ClientErrorReporter.reportNonFatal(
                baseURL: baseURL,
                request: request,
                errorType: "ios_api_http_error",
                message: "HTTP \(httpResponse.statusCode) in DashboardAPI",
                error: APIError.httpError(
                    statusCode: httpResponse.statusCode,
                    message: errorMessage?["message"]
                ),
                metadata: ["client": "dashboard_api", "status_code": String(httpResponse.statusCode)]
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
                message: "Decode error in DashboardAPI",
                error: error,
                metadata: ["client": "dashboard_api"]
            )
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
