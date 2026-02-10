//  UploadManager.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation

actor UploadManager {
    struct Summary: Sendable {
        let queued: Int
        let presigned: Int
        let uploading: Int
        let uploaded: Int
        let awaitingCompletion: Int
        let completed: Int
        let failed: Int
        let terminalFailed: Int

        var inFlight: Int {
            queued + presigned + uploading + uploaded + awaitingCompletion + failed
        }
    }
    struct EnqueueRequest: Sendable {
        let eventId: String
        let localFileURL: URL
        let filename: String
        let contentType: String
        let contentLength: Int
    }

    private let store: UploadQueueStore
    private let api: UploadsAPIClient
    private let fileManager: FileManager
    private let connectivity: ConnectivityService
    private let backgroundSession: BackgroundUploadSessionManager
    private var workerTask: Task<Void, Never>?
    private var started = false

    private let maxRetryAttempts = 8

    private let maxConcurrentJobs = 3
    private var inProgressJobIds = Set<String>()

    init(baseURL: String, connectivity: ConnectivityService, backgroundSession: BackgroundUploadSessionManager, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.api = UploadsAPIClient(baseURL: baseURL)
        self.store = UploadQueueStore(dbURL: UploadManager.defaultDBURL(fileManager: fileManager))
        self.connectivity = connectivity
        self.backgroundSession = backgroundSession
    }

    func start() {
        guard !started else { return }
        started = true

        print("[UploadManager] start()")

        workerTask = Task { [weak self] in
            await self?.recoverStaleJobs()
            await self?.workerLoop()
        }
    }

    /// Re-run crash recovery (safe to call multiple times).
    func resume() async {
        await recoverStaleJobs()
    }

    private func recoverStaleJobs() async {
        // Use a 5-minute window so we only reset jobs that are genuinely stuck,
        // not ones still being uploaded by a background URLSession.
        let staleThreshold = Date().timeIntervalSince1970 - 300
        do {
            let recovered = try await store.resetStaleUploadingJobs(staleBefore: staleThreshold)
            if recovered > 0 {
                print("[UploadManager] Recovered \(recovered) stale uploading job(s)")
            }
        } catch {
            print("[UploadManager] Failed to recover stale jobs: \(error)")
        }
    }

    func stop() {
        print("[UploadManager] stop()")
        started = false
        workerTask?.cancel()
        workerTask = nil
    }

    func enqueue(_ request: EnqueueRequest) async throws -> String {
        let id = try await store.enqueue(
            eventId: request.eventId,
            localFileURL: request.localFileURL,
            filename: request.filename,
            contentType: request.contentType,
            contentLength: request.contentLength
        )

        print("[UploadManager] enqueue job=\(id) file=\(request.filename) bytes=\(request.contentLength) event=\(request.eventId)")
        return id
    }

    func summary() async -> Summary {
        do {
            let counts = try await store.fetchCountsByState()
            return Summary(
                queued: counts[.queued] ?? 0,
                presigned: counts[.presigned] ?? 0,
                uploading: counts[.uploading] ?? 0,
                uploaded: counts[.uploaded] ?? 0,
                awaitingCompletion: counts[.awaitingCompletion] ?? 0,
                completed: counts[.completed] ?? 0,
                failed: counts[.failed] ?? 0,
                terminalFailed: counts[.terminalFailed] ?? 0
            )
        } catch {
            return Summary(queued: 0, presigned: 0, uploading: 0, uploaded: 0, awaitingCompletion: 0, completed: 0, failed: 0, terminalFailed: 0)
        }
    }

    func recentJobStates(limit: Int = 500) async -> [String: UploadJobState] {
        do {
            return try await store.fetchRecentJobStates(limit: limit)
        } catch {
            return [:]
        }
    }

    struct EventSummary: Sendable, Identifiable {
        let eventId: String
        let completed: Int
        let pending: Int

        var id: String { eventId }
        var total: Int { completed + pending }
    }

    func activeEventSummaries(limit: Int = 20) async -> [EventSummary] {
        do {
            let byEvent = try await store.fetchCountsByEventAndState()
            var result: [EventSummary] = []
            result.reserveCapacity(byEvent.count)

            for (eventId, counts) in byEvent {
                let completed = counts[.completed] ?? 0
                let queued = counts[.queued] ?? 0
                let presigned = counts[.presigned] ?? 0
                let uploading = counts[.uploading] ?? 0
                let uploaded = counts[.uploaded] ?? 0
                let awaiting = counts[.awaitingCompletion] ?? 0
                let failed = counts[.failed] ?? 0
                let pending = queued + presigned + uploading + uploaded + awaiting + failed

                guard pending > 0 else { continue }
                result.append(EventSummary(eventId: eventId, completed: completed, pending: pending))
            }

            result.sort { a, b in
                if a.pending != b.pending { return a.pending > b.pending }
                if a.completed != b.completed { return a.completed > b.completed }
                return a.eventId < b.eventId
            }

            if result.count > limit {
                result.removeLast(result.count - limit)
            }

            return result
        } catch {
            return []
        }
    }

    func eventSummaries(eventIds: [String]) async -> [String: EventSummary] {
        guard !eventIds.isEmpty else { return [:] }
        do {
            let byEvent = try await store.fetchCountsByEventAndState()
            var result: [String: EventSummary] = [:]
            result.reserveCapacity(eventIds.count)

            for eventId in eventIds {
                let counts = byEvent[eventId] ?? [:]

                let completed = counts[.completed] ?? 0
                let queued = counts[.queued] ?? 0
                let presigned = counts[.presigned] ?? 0
                let uploading = counts[.uploading] ?? 0
                let uploaded = counts[.uploaded] ?? 0
                let awaiting = counts[.awaitingCompletion] ?? 0
                let failed = counts[.failed] ?? 0
                let pending = queued + presigned + uploading + uploaded + awaiting + failed

                result[eventId] = EventSummary(eventId: eventId, completed: completed, pending: pending)
            }

            return result
        } catch {
            return [:]
        }
    }

    // MARK: - Background drain

    /// Process queued jobs sequentially until the deadline or queue is empty.
    /// Designed for BGProcessingTask where we have limited execution time.
    func drainOnce(deadline: Date) async {
        await recoverStaleJobs()

        while Date() < deadline {
            let now = Date().timeIntervalSince1970
            guard let job = try? await store.fetchNextRunnable(now: now) else { break }
            try? await store.markClaimed(jobId: job.id)
            print("[UploadManager] bgDrain job=\(job.id) state=\(job.state.rawValue)")
            await process(job)
        }
    }

    // MARK: - Internals

    private func workerLoop() async {
        print("[UploadManager] workerLoop started")
        while !Task.isCancelled {
            if !started {
                break
            }

            if !(await connectivity.snapshot().isOnline) {
                await waitForOnline()
                continue
            }

            let now = Date().timeIntervalSince1970
            do {
                while inProgressJobIds.count < maxConcurrentJobs {
                    guard let job = try await store.fetchNextRunnable(now: now) else {
                        break
                    }

                    if inProgressJobIds.contains(job.id) {
                        break
                    }

                    // Prevent immediately picking the same job again while it is running.
                    try await store.markClaimed(jobId: job.id)

                    let nextAt = Date(timeIntervalSince1970: job.nextAttemptAt)
                    print("[UploadManager] picked job=\(job.id) state=\(job.state.rawValue) attempts=\(job.attempts) next=\(nextAt) lastError=\(job.lastError ?? "-")")

                    inProgressJobIds.insert(job.id)
                    Task { [weak self] in
                        await self?.process(job)
                        await self?.jobFinished(job.id)
                    }
                }
            } catch {
                print("[UploadManager] Queue fetch error: \(error)")
            }

            try? await Task.sleep(nanoseconds: 400_000_000)
        }

        print("[UploadManager] workerLoop stopped")
    }

    private func jobFinished(_ jobId: String) {
        inProgressJobIds.remove(jobId)
    }

    private func waitForOnline() async {
        print("[UploadManager] Offline; waiting for connectivity...")
        let stream = await connectivity.stream()
        for await state in stream {
            if state.isOnline {
                print("[UploadManager] Back online")
                return
            }
        }
    }

    private func process(_ job: UploadJobRecord) async {
        do {
            switch job.state {
            case .queued, .failed:
                print("[UploadManager] job=\(job.id) presign")
                try await ensurePresigned(job)

                guard let updated = try await store.fetch(jobId: job.id) else {
                    throw UploadManagerError.missingJob
                }

                print("[UploadManager] job=\(job.id) upload")
                try await upload(updated)

                // Re-fetch after upload: upload() may have refreshed the presign internally.
                guard let postUpload = try await store.fetch(jobId: job.id) else {
                    throw UploadManagerError.missingJob
                }
                print("[UploadManager] job=\(job.id) poll")
                try await checkCompletion(postUpload)

            case .presigned:
                print("[UploadManager] job=\(job.id) upload (presigned)")
                try await upload(job)

                guard let postUpload = try await store.fetch(jobId: job.id) else {
                    throw UploadManagerError.missingJob
                }
                print("[UploadManager] job=\(job.id) poll")
                try await checkCompletion(postUpload)

            case .uploaded, .awaitingCompletion:
                print("[UploadManager] job=\(job.id) poll (already uploaded)")
                try await checkCompletion(job)

            case .uploading, .completed, .terminalFailed:
                break
            }
        } catch {
            let classification = classify(error)
            let attempts = job.attempts + 1

            if attempts >= maxRetryAttempts || classification.disposition == .terminal {
                print("[UploadManager] job=\(job.id) terminal error=\(classification.message)")
                try? await store.markState(
                    jobId: job.id,
                    state: .terminalFailed,
                    nextAttemptAt: farFuture(),
                    attemptsDelta: 1,
                    lastError: classification.message
                )
                return
            }

            let delay = classification.retryAfterSeconds.map(TimeInterval.init) ?? backoffSeconds(attempt: attempts)
            print("[UploadManager] job=\(job.id) error=\(classification.message) retryIn=\(delay)s")
            try? await store.markState(
                jobId: job.id,
                state: .failed,
                nextAttemptAt: Date().timeIntervalSince1970 + delay,
                attemptsDelta: 1,
                lastError: classification.message
            )
        }
    }

    private enum FailureDisposition {
        case retryable
        case terminal
    }

    private struct FailureClassification {
        let disposition: FailureDisposition
        let message: String
        let retryAfterSeconds: Int?
    }

    private func classify(_ error: Error) -> FailureClassification {
        if let e = error as? UploadsAPIError {
            switch e {
            case .http(_, let code, let message, let retryAfter):
                let msg = [code, message].compactMap { $0 }.joined(separator: ": ")
                return FailureClassification(
                    disposition: e.isRetryable ? .retryable : .terminal,
                    message: msg.isEmpty ? e.localizedDescription : msg,
                    retryAfterSeconds: retryAfter
                )
            default:
                return FailureClassification(
                    disposition: e.isRetryable ? .retryable : .terminal,
                    message: e.localizedDescription,
                    retryAfterSeconds: nil
                )
            }
        }

        if let e = error as? UploadManagerError {
            switch e {
            case .invalidFileURL, .missingJob, .localFileMissing:
                return FailureClassification(disposition: .terminal, message: e.localizedDescription, retryAfterSeconds: nil)
            case .remoteFailed:
                // Server-side processing failure for this intent.
                return FailureClassification(disposition: .terminal, message: e.localizedDescription, retryAfterSeconds: nil)
            default:
                return FailureClassification(disposition: .retryable, message: e.localizedDescription, retryAfterSeconds: nil)
            }
        }

        if let urlError = error as? URLError {
            return FailureClassification(disposition: .retryable, message: urlError.localizedDescription, retryAfterSeconds: nil)
        }

        return FailureClassification(disposition: .retryable, message: error.localizedDescription, retryAfterSeconds: nil)
    }

    private func backoffSeconds(attempt: Int) -> TimeInterval {
        min(pow(2.0, Double(max(attempt, 1))), 60.0)
    }

    private func farFuture() -> TimeInterval {
        Date(timeIntervalSinceNow: 60 * 60 * 24 * 365).timeIntervalSince1970
    }

    private func ensurePresigned(_ job: UploadJobRecord) async throws {
        // If we already have an uploadId, prefer re-presign (rotates key) so we can retry safely.
        if let uploadId = job.uploadId {
            print("[UploadManager] job=\(job.id) repressign uploadId=\(uploadId)")
            let presigned = try await api.repressign(uploadId: uploadId)
            try await store.markPresigned(
                jobId: job.id,
                uploadId: presigned.uploadId,
                putUrl: presigned.putUrl,
                objectKey: presigned.objectKey,
                expiresAt: presigned.expiresAt,
                requiredHeadersJSON: try jsonString(from: presigned.requiredHeaders)
            )
            return
        }

        print("[UploadManager] job=\(job.id) presign event=\(job.eventId)")
        let presigned = try await api.presign(
            eventId: job.eventId,
            contentType: job.contentType,
            contentLength: job.contentLength,
            filename: job.filename
        )

        try await store.markPresigned(
            jobId: job.id,
            uploadId: presigned.uploadId,
            putUrl: presigned.putUrl,
            objectKey: presigned.objectKey,
            expiresAt: presigned.expiresAt,
            requiredHeadersJSON: try jsonString(from: presigned.requiredHeaders)
        )
    }

    private func upload(_ job: UploadJobRecord) async throws {
        let now = Date().timeIntervalSince1970

        // File is required only for the actual PUT upload.
        guard let fileURL = URL(string: job.localFileURL) else {
            print("[UploadManager] job=\(job.id) invalid localFileURL=\(job.localFileURL)")
            throw UploadManagerError.invalidFileURL
        }

        guard fileManager.fileExists(atPath: fileURL.path) else {
            print("[UploadManager] job=\(job.id) file missing: \(fileURL.path)")
            throw UploadManagerError.localFileMissing
        }

        var activeJob = job
        // If presign is expired, re-presign and continue with the refreshed job.
        if let expiresAt = job.expiresAt, isExpired(expiresAtISO8601: expiresAt) {
            print("[UploadManager] job=\(job.id) presign expired; refreshing")
            try await ensurePresigned(job)
            guard let refreshed = try await store.fetch(jobId: job.id) else {
                throw UploadManagerError.missingPresign
            }
            activeJob = refreshed
        }

        try await store.markState(jobId: activeJob.id, state: .uploading, nextAttemptAt: now, attemptsDelta: 0, lastError: nil)

        guard let refreshedPutUrl = activeJob.putUrl, let refreshedPutURL = URL(string: refreshedPutUrl) else {
            throw UploadManagerError.missingPresign
        }

        var request = URLRequest(url: refreshedPutURL)
        request.httpMethod = "PUT"

        if let requiredHeadersJSON = activeJob.requiredHeadersJSON,
           let required = try decodeHeadersJSON(requiredHeadersJSON) {
            for (k, v) in required {
                request.setValue(v, forHTTPHeaderField: k)
            }
        } else {
            request.setValue(activeJob.contentType, forHTTPHeaderField: "Content-Type")
            request.setValue(String(activeJob.contentLength), forHTTPHeaderField: "Content-Length")
            request.setValue("*", forHTTPHeaderField: "If-None-Match")
        }

        let http = try await backgroundSession.upload(request: request, fileURL: fileURL, taskDescription: activeJob.id)
        guard (200...299).contains(http.statusCode) else {
            throw UploadManagerError.http(statusCode: http.statusCode)
        }

        print("[UploadManager] job=\(activeJob.id) upload OK status=\(http.statusCode)")

        try await store.markState(jobId: activeJob.id, state: .uploaded, nextAttemptAt: Date().timeIntervalSince1970, attemptsDelta: 0, lastError: nil)
    }

    private func checkCompletion(_ job: UploadJobRecord) async throws {
        let now = Date().timeIntervalSince1970
        guard let uploadId = job.uploadId else {
            throw UploadManagerError.missingUploadId
        }

        try await store.markState(jobId: job.id, state: .awaitingCompletion, nextAttemptAt: now, attemptsDelta: 0, lastError: nil)

        let statuses = try await api.fetchStatus(uploadIds: [uploadId])
        if let status = statuses.first(where: { $0.uploadId == uploadId }) {
            switch status.status {
            case "completed":
                print("[UploadManager] job=\(job.id) status=completed")
                try await finalizeCompleted(job: job)
                return
            case "failed":
                print("[UploadManager] job=\(job.id) status=failed")
                throw UploadManagerError.remoteFailed(message: status.errorMessage)
            case "expired":
                print("[UploadManager] job=\(job.id) status=expired")
                // Re-presign and retry.
                try await ensurePresigned(job)
                return
            default:
                print("[UploadManager] job=\(job.id) status=\(status.status)")
                break
            }
        }

        // Not completed yet: schedule a later poll and move on.
        try await store.markState(jobId: job.id, state: .awaitingCompletion, nextAttemptAt: Date().timeIntervalSince1970 + 5, attemptsDelta: 0, lastError: nil)
    }

    private func finalizeCompleted(job: UploadJobRecord) async throws {
        guard let fileURL = URL(string: job.localFileURL) else {
            try await store.markState(jobId: job.id, state: .completed, nextAttemptAt: Date().timeIntervalSince1970, attemptsDelta: 0, lastError: nil)
            return
        }

        do {
            if fileManager.fileExists(atPath: fileURL.path) {
                try fileManager.removeItem(at: fileURL)
            }
        } catch {
            // Do not treat deletion as fatal; we can retry cleanup later.
            print("[UploadManager] Cleanup failed: \(error)")
        }

        print("[UploadManager] job=\(job.id) completed; local file deleted")

        try await store.markState(jobId: job.id, state: .completed, nextAttemptAt: Date().timeIntervalSince1970, attemptsDelta: 0, lastError: nil)
    }

    // backoff() replaced by classify() + backoffSeconds(attempt:)

    private func isExpired(expiresAtISO8601: String) -> Bool {
        let f = ISO8601DateFormatter()
        if let date = f.date(from: expiresAtISO8601) {
            return date <= Date()
        }
        return false
    }

    private func jsonString(from headers: [String: String]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: headers)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    private func decodeHeadersJSON(_ json: String) throws -> [String: String]? {
        guard let data = json.data(using: .utf8) else { return nil }
        let obj = try JSONSerialization.jsonObject(with: data)
        return obj as? [String: String]
    }

    private static func defaultDBURL(fileManager: FileManager) -> URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport
            .appendingPathComponent("framefast", isDirectory: true)
            .appendingPathComponent("upload-queue", isDirectory: true)
            .appendingPathComponent("upload-queue.sqlite", isDirectory: false)
    }
}

enum UploadManagerError: Error, LocalizedError {
    case missingJob
    case invalidFileURL
    case localFileMissing
    case missingPresign
    case missingUploadId
    case badResponse
    case http(statusCode: Int)
    case remoteFailed(message: String?)

    var errorDescription: String? {
        switch self {
        case .missingJob:
            return "Upload job missing"
        case .invalidFileURL:
            return "Invalid file URL"
        case .localFileMissing:
            return "Local file missing"
        case .missingPresign:
            return "Missing presign URL"
        case .missingUploadId:
            return "Missing upload ID"
        case .badResponse:
            return "Bad HTTP response"
        case .http(let statusCode):
            return "HTTP \(statusCode)"
        case .remoteFailed(let message):
            return "Upload failed: \(message ?? "Unknown error")"
        }
    }
}
