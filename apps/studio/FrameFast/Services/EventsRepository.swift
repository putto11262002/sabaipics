import Clerk
import Foundation

actor EventsRepository {
    enum Source: String, Sendable {
        case network
        case cache
    }

    struct Result<Value: Sendable>: Sendable {
        let value: Value
        let source: Source
        let fetchedAt: Date
    }

    private let apiClient: EventsAPIClient
    private let cache: DiskCache
    private let baseURL: String

    init(baseURL: String) {
        self.baseURL = baseURL
        self.apiClient = EventsAPIClient(baseURL: baseURL)
        self.cache = DiskCache(directoryName: "FrameFastCache")
    }

    func fetchEvents(page: Int = 0, limit: Int = 10) async throws -> Result<EventsResponse> {
        guard let cacheNamespace = await cacheNamespaceForCurrentUser() else {
            let response = try await apiClient.fetchEvents(page: page, limit: limit)
            let now = Date()
            return Result(value: response, source: .network, fetchedAt: now)
        }

        let cacheKey = "\(cacheNamespace):list:page=\(page):limit=\(limit)"
        do {
            let response = try await apiClient.fetchEvents(page: page, limit: limit)
            let entry = CacheEntry(fetchedAt: Date(), value: response)
            await cache.writeEntry(key: cacheKey, entry: entry)
            return Result(value: response, source: .network, fetchedAt: entry.fetchedAt)
        } catch {
            guard shouldFallbackToCache(error) else { throw error }
            if let entry: CacheEntry<EventsResponse> = await cache.readEntry(key: cacheKey) {
                print("[EventsRepository] Network failed; using cached events list (\(page), \(limit))")
                return Result(value: entry.value, source: .cache, fetchedAt: entry.fetchedAt)
            }
            throw error
        }
    }

    func fetchEvent(id: String) async throws -> Result<EventResponse> {
        guard let cacheNamespace = await cacheNamespaceForCurrentUser() else {
            let response = try await apiClient.fetchEvent(id: id)
            let now = Date()
            return Result(value: response, source: .network, fetchedAt: now)
        }

        let cacheKey = "\(cacheNamespace):event:\(id)"
        do {
            let response = try await apiClient.fetchEvent(id: id)
            let entry = CacheEntry(fetchedAt: Date(), value: response)
            await cache.writeEntry(key: cacheKey, entry: entry)
            return Result(value: response, source: .network, fetchedAt: entry.fetchedAt)
        } catch {
            guard shouldFallbackToCache(error) else { throw error }
            if let entry: CacheEntry<EventResponse> = await cache.readEntry(key: cacheKey) {
                print("[EventsRepository] Network failed; using cached event \(id)")
                return Result(value: entry.value, source: .cache, fetchedAt: entry.fetchedAt)
            }
            throw error
        }
    }

    private func cacheNamespaceForCurrentUser() async -> String? {
        let userId = await MainActor.run { Clerk.shared.user?.id }
        guard let userId, !userId.isEmpty else { return nil }
        return "events:\(baseURL):user:\(userId)"
    }

    private func shouldFallbackToCache(_ error: Error) -> Bool {
        if error is URLError { return true }
        if let apiError = error as? APIError {
            switch apiError {
            case .networkError:
                return true
            case .notAuthenticated, .invalidURL, .noToken, .decodingError, .httpError:
                return false
            }
        }
        return false
    }
}
