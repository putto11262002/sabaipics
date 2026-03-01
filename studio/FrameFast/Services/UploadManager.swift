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
    private let api: any UploadsAPIClienting
    private let fileManager: FileManager
    private let connectivity: any ConnectivityServicing
    private let backgroundSession: any BackgroundUploadSessionManaging
    private let now: @Sendable () -> TimeInterval
    private let sleepNanoseconds: @Sendable (_ nanoseconds: UInt64) async -> Void
    private let reducer = UploadJobReducer()
    private var workerTask: Task<Void, Never>?
    private var started = false

    private let maxRetryAttempts = 8

    private let maxConcurrentJobs = 3
    private var inProgressJobIds = Set<String>()

    private enum ProcessingMode {
        case foreground
        case backgroundDrain
    }

    init(
        baseURL: String,
        connectivity: ConnectivityService,
        backgroundSession: BackgroundUploadSessionManager,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.api = UploadsAPIClient(baseURL: baseURL)
        self.store = UploadQueueStore(dbURL: UploadManager.defaultDBURL(fileManager: fileManager))
        self.connectivity = connectivity
        self.backgroundSession = backgroundSession
        self.now = { Date().timeIntervalSince1970 }
        self.sleepNanoseconds = { ns in
            try? await Task.sleep(nanoseconds: ns)
        }

        self.backgroundSession.onOrphanUploadCompletion = { [weak self] (jobId: String, result: Result<HTTPURLResponse, Error>) in
            guard let self else { return }
            Task {
                await self.handleOrphanUploadCompletion(jobId: jobId, result: result)
            }
        }
    }

    init(
        baseURL: String,
        store: UploadQueueStore,
        connectivity: ConnectivityService,
        backgroundSession: BackgroundUploadSessionManager,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.api = UploadsAPIClient(baseURL: baseURL)
        self.store = store
        self.connectivity = connectivity
        self.backgroundSession = backgroundSession
        self.now = { Date().timeIntervalSince1970 }
        self.sleepNanoseconds = { ns in
            try? await Task.sleep(nanoseconds: ns)
        }

        self.backgroundSession.onOrphanUploadCompletion = { [weak self] (jobId: String, result: Result<HTTPURLResponse, Error>) in
            guard let self else { return }
            Task {
                await self.handleOrphanUploadCompletion(jobId: jobId, result: result)
            }
        }
    }

    init(
        store: UploadQueueStore,
        api: any UploadsAPIClienting,
        connectivity: any ConnectivityServicing,
        backgroundSession: any BackgroundUploadSessionManaging,
        fileManager: FileManager = .default,
        now: @Sendable @escaping () -> TimeInterval = { Date().timeIntervalSince1970 },
        sleepNanoseconds: @Sendable @escaping (_ nanoseconds: UInt64) async -> Void = { ns in
            try? await Task.sleep(nanoseconds: ns)
        }
    ) {
        self.store = store
        self.api = api
        self.connectivity = connectivity
        self.backgroundSession = backgroundSession
        self.fileManager = fileManager
        self.now = now
        self.sleepNanoseconds = sleepNanoseconds

        self.backgroundSession.onOrphanUploadCompletion = { [weak self] (jobId: String, result: Result<HTTPURLResponse, Error>) in
            guard let self else { return }
            Task {
                await self.handleOrphanUploadCompletion(jobId: jobId, result: result)
            }
        }
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
        // Recover jobs that are in `uploading` state but have no active background URLSession task.
        // This avoids resetting legitimate long-running uploads.
        let currentTime = now()
        let staleThreshold = currentTime - 300
        do {
            let tasks = await backgroundSession.getAllTasks()
            let inFlightJobIds = Set(tasks.compactMap { $0.taskDescription })

            let candidateIds = try await store.fetchUploadingJobIds(updatedBefore: staleThreshold)
            var recovered = 0
            for jobId in candidateIds {
                guard !inFlightJobIds.contains(jobId) else { continue }
                try await store.markState(
                    jobId: jobId,
                    state: .failed,
                    nextAttemptAt: currentTime,
                    attemptsDelta: 0,
                    lastError: "recovered: no active URLSessionTask"
                )
                recovered += 1
            }

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

    func completedCountLast7Days(now: TimeInterval = Date().timeIntervalSince1970) async -> Int {
        do {
            return try await store.countCompletedJobs(updatedAfter: now - 7 * 24 * 60 * 60)
        } catch {
            print("[UploadManager] Failed to fetch 7d completed count: \(error)")
            return 0
        }
    }

    // MARK: - Background drain

    /// Process queued jobs sequentially until cancelled or queue is empty.
    /// Designed for BGProcessingTask — caller cancels the Task from the expirationHandler.
    func drainOnce() async {
        await recoverStaleJobs()

        while !Task.isCancelled {
            if !(await connectivity.snapshot().isOnline) {
                print("[UploadManager] bgDrain offline, stopping")
                break
            }

            let currentTime = now()
            do {
                guard let job = try await store.claimNextRunnable(now: currentTime) else { break }
                print("[UploadManager] bgDrain job=\(job.id) state=\(job.state.rawValue)")
                let startedUpload = await process(job, mode: .backgroundDrain)
                if startedUpload {
                    // Start-and-return mode: let iOS background URLSession continue the upload.
                    // We'll reconcile completion later.
                    break
                }
            } catch {
                print("[UploadManager] bgDrain queue error: \(error)")
                break
            }
        }

        print("[UploadManager] bgDrain finished, cancelled=\(Task.isCancelled)")
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

            let currentTime = now()
            do {
                while inProgressJobIds.count < maxConcurrentJobs {
                    guard let job = try await store.claimNextRunnable(now: currentTime) else {
                        break
                    }

                    if inProgressJobIds.contains(job.id) {
                        break
                    }

                    let nextAt = Date(timeIntervalSince1970: job.nextAttemptAt)
                    print("[UploadManager] picked job=\(job.id) state=\(job.state.rawValue) attempts=\(job.attempts) next=\(nextAt) lastError=\(job.lastError ?? "-")")

                    inProgressJobIds.insert(job.id)
                    Task { [weak self] in
                        _ = await self?.process(job, mode: .foreground)
                        await self?.jobFinished(job.id)
                    }
                }
            } catch {
                print("[UploadManager] Queue fetch error: \(error)")
            }

            await sleepNanoseconds(400_000_000)
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

    @discardableResult
    private func process(_ job: UploadJobRecord, mode: ProcessingMode) async -> Bool {
        var jobForRetry = job
        var startedBackgroundUpload = false
        do {
            // Always re-fetch before decisions so we act on the latest persisted state.
            if let latest = try await store.fetch(jobId: job.id) {
                jobForRetry = latest
            }

            let effects = reducer.effects(for: jobForRetry)
            guard !effects.isEmpty else { return false }

            for effect in effects {
                if Task.isCancelled { return false }

                let shouldContinue = try await run(effect: effect, jobId: jobForRetry.id, mode: mode)
                if !shouldContinue {
                    startedBackgroundUpload = (mode == .backgroundDrain && effect == .upload)
                    break
                }
            }
        } catch {
            let classification = classify(error)
            let attempts = jobForRetry.attempts + 1

            if attempts >= maxRetryAttempts || classification.disposition == .terminal {
                print("[UploadManager] job=\(jobForRetry.id) terminal error=\(classification.message)")
                try? await store.markState(
                    jobId: jobForRetry.id,
                    state: .terminalFailed,
                    nextAttemptAt: farFuture(),
                    attemptsDelta: 1,
                    lastError: classification.message
                )
                return false
            }

            let delay = classification.retryAfterSeconds.map(TimeInterval.init) ?? backoffSeconds(attempt: attempts)
            print("[UploadManager] job=\(jobForRetry.id) error=\(classification.message) retryIn=\(delay)s")
            try? await store.markState(
                jobId: jobForRetry.id,
                state: .failed,
                nextAttemptAt: now() + delay,
                attemptsDelta: 1,
                lastError: classification.message
            )
            return false
        }

        return startedBackgroundUpload
    }

    private func run(effect: UploadJobEffect, jobId: String, mode: ProcessingMode) async throws -> Bool {
        // Re-fetch before each effect so subsequent effects always see fresh state.
        guard let job = try await store.fetch(jobId: jobId) else {
            throw UploadManagerError.missingJob
        }

        switch effect {
        case .ensurePresigned:
            print("[UploadManager] job=\(job.id) presign")
            try await ensurePresigned(job)
            return true

        case .upload:
            if mode == .backgroundDrain {
                print("[UploadManager] job=\(job.id) upload (background)")
                try await startUpload(job)
                return false
            }

            if job.state == .presigned {
                print("[UploadManager] job=\(job.id) upload (presigned)")
            } else {
                print("[UploadManager] job=\(job.id) upload")
            }
            try await upload(job)
            return true

        case .checkCompletion:
            print("[UploadManager] job=\(job.id) poll")
            try await checkCompletion(job)
            return true
        }
    }

    private func handleOrphanUploadCompletion(jobId: String, result: Result<HTTPURLResponse, Error>) async {
        // Ignore if the job no longer exists or has already moved past upload.
        guard let job = (try? await store.fetch(jobId: jobId)) ?? nil else { return }
        guard job.state == .uploading else { return }

        switch result {
        case .success(let http):
            if (200...299).contains(http.statusCode) {
                print("[UploadManager] job=\(jobId) orphan upload OK status=\(http.statusCode)")
                try? await store.markState(
                    jobId: jobId,
                    state: .uploaded,
                    nextAttemptAt: now(),
                    attemptsDelta: 0,
                    lastError: nil
                )
            } else {
                await handleOrphanUploadFailure(job: job, error: UploadManagerError.http(statusCode: http.statusCode))
            }

        case .failure(let error):
            await handleOrphanUploadFailure(job: job, error: error)
        }
    }

    private func handleOrphanUploadFailure(job: UploadJobRecord, error: Error) async {
        let classification = classify(error)
        let attempts = job.attempts + 1

        if attempts >= maxRetryAttempts || classification.disposition == .terminal {
            print("[UploadManager] job=\(job.id) orphan upload terminal error=\(classification.message)")
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
        print("[UploadManager] job=\(job.id) orphan upload error=\(classification.message) retryIn=\(delay)s")
        try? await store.markState(
            jobId: job.id,
            state: .failed,
            nextAttemptAt: now() + delay,
            attemptsDelta: 1,
            lastError: classification.message
        )
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
            case .api(_, let code, let message, _):
                let msg = [code.rawValue, message].compactMap { $0 }.joined(separator: ": ")
                return FailureClassification(
                    disposition: e.isRetryable ? .retryable : .terminal,
                    message: msg.isEmpty ? e.localizedDescription : msg,
                    retryAfterSeconds: e.retryAfterSeconds
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
        let currentTime = now()

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

        try await store.markState(jobId: activeJob.id, state: .uploading, nextAttemptAt: currentTime, attemptsDelta: 0, lastError: nil)

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

        try await store.markState(jobId: activeJob.id, state: .uploaded, nextAttemptAt: now(), attemptsDelta: 0, lastError: nil)
    }

    private func startUpload(_ job: UploadJobRecord) async throws {
        let currentTime = now()

        guard let fileURL = URL(string: job.localFileURL) else {
            print("[UploadManager] job=\(job.id) invalid localFileURL=\(job.localFileURL)")
            throw UploadManagerError.invalidFileURL
        }

        guard fileManager.fileExists(atPath: fileURL.path) else {
            print("[UploadManager] job=\(job.id) file missing: \(fileURL.path)")
            throw UploadManagerError.localFileMissing
        }

        var activeJob = job
        if let expiresAt = job.expiresAt, isExpired(expiresAtISO8601: expiresAt) {
            print("[UploadManager] job=\(job.id) presign expired; refreshing")
            try await ensurePresigned(job)
            guard let refreshed = try await store.fetch(jobId: job.id) else {
                throw UploadManagerError.missingPresign
            }
            activeJob = refreshed
        }

        try await store.markState(jobId: activeJob.id, state: .uploading, nextAttemptAt: currentTime, attemptsDelta: 0, lastError: nil)

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

        backgroundSession.startUpload(request: request, fileURL: fileURL, taskDescription: activeJob.id)
        print("[UploadManager] job=\(activeJob.id) upload started (background)")
    }

    private func checkCompletion(_ job: UploadJobRecord) async throws {
        let currentTime = now()
        guard let uploadId = job.uploadId else {
            throw UploadManagerError.missingUploadId
        }

        try await store.markState(jobId: job.id, state: .awaitingCompletion, nextAttemptAt: currentTime, attemptsDelta: 0, lastError: nil)

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
        try await store.markState(jobId: job.id, state: .awaitingCompletion, nextAttemptAt: now() + 5, attemptsDelta: 0, lastError: nil)
    }

    private func finalizeCompleted(job: UploadJobRecord) async throws {
        // File stays on disk for retention-based cleanup.
        print("[UploadManager] job=\(job.id) completed; file retained for cleanup")
        try await store.markState(jobId: job.id, state: .completed, nextAttemptAt: now(), attemptsDelta: 0, lastError: nil)
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

    static func defaultDBURL(fileManager: FileManager = .default) -> URL {
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
