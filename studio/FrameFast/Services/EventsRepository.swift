import Clerk
import Foundation

actor EventsRepository {
    private let apiClient: EventsAPIClient
    private let swr: StaleWhileRevalidate
    private let baseURL: String

    private static let ttl: TimeInterval = 30             // 30 seconds
    private static let networkTimeout: TimeInterval = 8   // 8 seconds

    init(baseURL: String) {
        self.baseURL = baseURL
        self.apiClient = EventsAPIClient(baseURL: baseURL)
        self.swr = StaleWhileRevalidate(cache: DiskCache(directoryName: "FrameFastCache"))
    }

    // MARK: - Events List

    func fetchEvents(
        page: Int = 0,
        limit: Int = 10,
        onRevalidate: (@MainActor @Sendable (_ result: SWRResult<EventsResponse>) -> Void)? = nil,
        onAuthError: (@MainActor @Sendable (_ error: Error) -> Void)? = nil
    ) async throws -> SWRResult<EventsResponse> {
        guard let ns = await cacheNamespaceForCurrentUser() else {
            // No authenticated user — fetch without caching.
            let response = try await apiClient.fetchEvents(page: page, limit: limit)
            return SWRResult(value: response, source: .network, fetchedAt: Date())
        }

        let key = "\(ns):list:page=\(page):limit=\(limit)"
        return try await swr.fetch(
            key: key,
            ttl: Self.ttl,
            timeout: Self.networkTimeout,
            fetch: { [apiClient] in try await apiClient.fetchEvents(page: page, limit: limit) },
            onRevalidate: onRevalidate,
            onError: onAuthError.map { callback in
                { @MainActor @Sendable error in
                    if let apiError = error as? APIError, apiError.isAuthError {
                        callback(error)
                    }
                }
            }
        )
    }

    func refreshEvents(page: Int = 0, limit: Int = 10) async throws -> SWRResult<EventsResponse> {
        guard let ns = await cacheNamespaceForCurrentUser() else {
            let response = try await apiClient.fetchEvents(page: page, limit: limit)
            return SWRResult(value: response, source: .network, fetchedAt: Date())
        }

        let key = "\(ns):list:page=\(page):limit=\(limit)"
        return try await swr.refresh(
            key: key,
            fetch: { [apiClient] in try await apiClient.fetchEvents(page: page, limit: limit) }
        )
    }

    // MARK: - Single Event

    func fetchEvent(
        id: String,
        onRevalidate: (@MainActor @Sendable (_ result: SWRResult<EventResponse>) -> Void)? = nil
    ) async throws -> SWRResult<EventResponse> {
        guard let ns = await cacheNamespaceForCurrentUser() else {
            let response = try await apiClient.fetchEvent(id: id)
            return SWRResult(value: response, source: .network, fetchedAt: Date())
        }

        let key = "\(ns):event:\(id)"
        return try await swr.fetch(
            key: key,
            ttl: Self.ttl,
            timeout: Self.networkTimeout,
            fetch: { [apiClient] in try await apiClient.fetchEvent(id: id) },
            onRevalidate: onRevalidate
        )
    }

    // MARK: - Event Mutations

    func updateEvent(id: String, input: UpdateEventInput) async throws -> EventResponse {
        try await apiClient.updateEvent(id: id, input: input)
    }

    // MARK: - FTP Credentials

    func fetchFtpCredentials(eventId: String) async throws -> FtpCredentials {
        try await apiClient.fetchFtpCredentials(eventId: eventId)
    }

    func revealFtpPassword(eventId: String) async throws -> FtpRevealData {
        try await apiClient.revealFtpPassword(eventId: eventId)
    }

    // MARK: - Image Pipeline

    func fetchImagePipeline(eventId: String) async throws -> ImagePipelineResponse {
        try await apiClient.fetchImagePipeline(eventId: eventId)
    }

    func updateImagePipeline(eventId: String, input: UpdateImagePipelineInput) async throws -> ImagePipelineResponse {
        try await apiClient.updateImagePipeline(eventId: eventId, input: input)
    }

    // MARK: - Studio

    func fetchAutoEditPresets() async throws -> AutoEditPresetsResponse {
        try await apiClient.fetchAutoEditPresets()
    }

    func fetchStudioLuts() async throws -> StudioLutsResponse {
        try await apiClient.fetchStudioLuts()
    }

    // MARK: - Private

    private func cacheNamespaceForCurrentUser() async -> String? {
        let userId = await MainActor.run { Clerk.shared.user?.id }
        guard let userId, !userId.isEmpty else { return nil }
        return "events:\(baseURL):user:\(userId)"
    }
}
