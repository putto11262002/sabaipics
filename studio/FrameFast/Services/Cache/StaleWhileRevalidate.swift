//
//  StaleWhileRevalidate.swift
//  FrameFast
//
//  Generic stale-while-revalidate caching helper built on DiskCache.
//
//  Behaviour:
//  1. Cache exists & fresh (< TTL) → return cached data, skip network.
//  2. Cache exists & stale (≥ TTL) → return cached data immediately,
//     revalidate from network in background; call onRevalidate on success.
//  3. No cache → fetch from network (with timeout), write cache on success.
//  4. Network fails with no cache → throw.
//

import Foundation

// MARK: - Result types

enum SWRSource: String, Sendable {
    case network
    case cache
}

struct SWRResult<Value: Sendable>: Sendable {
    let value: Value
    let source: SWRSource
    let fetchedAt: Date
}

// MARK: - Helper

actor StaleWhileRevalidate {
    private let cache: DiskCache

    init(cache: DiskCache) {
        self.cache = cache
    }

    /// Fetch with stale-while-revalidate strategy.
    ///
    /// - Parameters:
    ///   - key: Cache key (caller should namespace with userId).
    ///   - ttl: Freshness window — cache younger than this is returned without a network call.
    ///   - timeout: Network request timeout for cold-start (no cache) fetches.
    ///   - fetch: The network call that produces a fresh value.
    ///   - onRevalidate: Called on `@MainActor` when background revalidation succeeds (stale-cache path only).
    ///   - onError: Called on `@MainActor` when background revalidation fails. Use to surface auth errors that require user action.
    func fetch<Value: Codable & Sendable>(
        key: String,
        ttl: TimeInterval,
        timeout: TimeInterval,
        fetch: @escaping @Sendable () async throws -> Value,
        onRevalidate: (@MainActor @Sendable (_ result: SWRResult<Value>) -> Void)? = nil,
        onError: (@MainActor @Sendable (_ error: Error) -> Void)? = nil
    ) async throws -> SWRResult<Value> {
        let cached: CacheEntry<Value>? = await cache.readEntry(key: key)

        // 1. Fresh cache — return immediately, skip network
        if let cached, Date().timeIntervalSince(cached.fetchedAt) < ttl {
            return SWRResult(value: cached.value, source: .cache, fetchedAt: cached.fetchedAt)
        }

        // 2. Stale cache — return immediately, revalidate in background
        if let cached {
            let cacheRef = self.cache
            Task.detached {
                do {
                    let value = try await fetch()
                    let entry = CacheEntry(fetchedAt: Date(), value: value)
                    await cacheRef.writeEntry(key: key, entry: entry)
                    let result = SWRResult(value: value, source: .network, fetchedAt: entry.fetchedAt)
                    await onRevalidate?(result)
                } catch {
                    print("[SWR] Background revalidation failed (\(key)): \(error.localizedDescription)")
                    await onError?(error)
                }
            }
            return SWRResult(value: cached.value, source: .cache, fetchedAt: cached.fetchedAt)
        }

        // 3. No cache — fetch from network with timeout
        let value = try await fetchWithTimeout(timeout, fetch: fetch)
        let entry = CacheEntry(fetchedAt: Date(), value: value)
        await cache.writeEntry(key: key, entry: entry)
        return SWRResult(value: value, source: .network, fetchedAt: entry.fetchedAt)
    }

    /// Always hit the network, updating cache on success.
    /// Used for explicit refresh (pull-to-refresh).
    func refresh<Value: Codable & Sendable>(
        key: String,
        fetch: @Sendable () async throws -> Value
    ) async throws -> SWRResult<Value> {
        let value = try await fetch()
        let entry = CacheEntry(fetchedAt: Date(), value: value)
        await cache.writeEntry(key: key, entry: entry)
        return SWRResult(value: value, source: .network, fetchedAt: entry.fetchedAt)
    }

    // MARK: - Private

    private func fetchWithTimeout<Value: Sendable>(
        _ timeout: TimeInterval,
        fetch: @escaping @Sendable () async throws -> Value
    ) async throws -> Value {
        try await withThrowingTaskGroup(of: Value.self) { group in
            group.addTask {
                try await fetch()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw URLError(.timedOut)
            }
            guard let result = try await group.next() else {
                throw URLError(.timedOut)
            }
            group.cancelAll()
            return result
        }
    }
}
