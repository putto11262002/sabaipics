//  UploadManager.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation
import Network

actor UploadManager {
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
    private let pathMonitor: NWPathMonitor
    private let pathMonitorQueue = DispatchQueue(label: "sabaipics.upload.pathmonitor")

    private var isOnline: Bool = true
    private var workerTask: Task<Void, Never>?
    private var started = false

    init(baseURL: String, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.api = UploadsAPIClient(baseURL: baseURL)
        self.store = UploadQueueStore(dbURL: UploadManager.defaultDBURL(fileManager: fileManager))
        self.pathMonitor = NWPathMonitor()
    }

    func start() {
        guard !started else { return }
        started = true

        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { [weak self] in
                await self?.setOnline(path.status == .satisfied)
            }
        }
        pathMonitor.start(queue: pathMonitorQueue)

        workerTask = Task { [weak self] in
            await self?.workerLoop()
        }
    }

    func stop() {
        started = false
        workerTask?.cancel()
        workerTask = nil
        pathMonitor.cancel()
    }

    func enqueue(_ request: EnqueueRequest) async throws -> String {
        try await store.enqueue(
            eventId: request.eventId,
            localFileURL: request.localFileURL,
            filename: request.filename,
            contentType: request.contentType,
            contentLength: request.contentLength
        )
    }

    // MARK: - Internals

    private func setOnline(_ online: Bool) {
        isOnline = online
    }

    private func workerLoop() async {
        while !Task.isCancelled {
            if !started {
                break
            }

            if !isOnline {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                continue
            }

            let now = Date().timeIntervalSince1970
            do {
                if let job = try await store.fetchNextRunnable(now: now) {
                    await process(job)
                    continue
                }
            } catch {
                print("[UploadManager] Queue fetch error: \(error)")
            }

            try? await Task.sleep(nanoseconds: 400_000_000)
        }
    }

    private func process(_ job: UploadJobRecord) async {
        // File may have been deleted externally; fail fast.
        guard let fileURL = URL(string: job.localFileURL) else {
            try? await store.markState(jobId: job.id, state: .failed, nextAttemptAt: Date().timeIntervalSince1970 + 60, attemptsDelta: 1, lastError: "Invalid file URL")
            return
        }

        guard fileManager.fileExists(atPath: fileURL.path) else {
            try? await store.markState(jobId: job.id, state: .failed, nextAttemptAt: Date().timeIntervalSince1970 + 60, attemptsDelta: 1, lastError: "File missing")
            return
        }

        do {
            switch job.state {
            case .queued, .failed:
                try await ensurePresigned(job)
                try await upload(jobId: job.id)
                try await pollUntilCompleted(jobId: job.id)

            case .presigned:
                try await upload(jobId: job.id)
                try await pollUntilCompleted(jobId: job.id)

            case .uploaded, .awaitingCompletion:
                try await pollUntilCompleted(jobId: job.id)

            case .uploading, .completed:
                break
            }
        } catch {
            let (delay, message) = backoff(job: job, error: error)
            try? await store.markState(
                jobId: job.id,
                state: .failed,
                nextAttemptAt: Date().timeIntervalSince1970 + delay,
                attemptsDelta: 1,
                lastError: message
            )
        }
    }

    private func ensurePresigned(_ job: UploadJobRecord) async throws {
        // If we already have an uploadId, prefer re-presign (rotates key) so we can retry safely.
        if let uploadId = job.uploadId {
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

    private func upload(jobId: String) async throws {
        let now = Date().timeIntervalSince1970
        guard let job = try await store.fetchNextRunnable(now: now), job.id == jobId else {
            return
        }

        guard let fileURL = URL(string: job.localFileURL) else {
            throw UploadManagerError.invalidFileURL
        }

        guard let putUrlString = job.putUrl, let putURL = URL(string: putUrlString) else {
            throw UploadManagerError.missingPresign
        }

        // If presign is expired, re-presign.
        if let expiresAt = job.expiresAt, isExpired(expiresAtISO8601: expiresAt) {
            try await ensurePresigned(job)
            return
        }

        try await store.markState(jobId: job.id, state: .uploading, nextAttemptAt: now, attemptsDelta: 0, lastError: nil)

        var request = URLRequest(url: putURL)
        request.httpMethod = "PUT"

        if let requiredHeadersJSON = job.requiredHeadersJSON,
           let required = try decodeHeadersJSON(requiredHeadersJSON) {
            for (k, v) in required {
                request.setValue(v, forHTTPHeaderField: k)
            }
        } else {
            request.setValue(job.contentType, forHTTPHeaderField: "Content-Type")
            request.setValue(String(job.contentLength), forHTTPHeaderField: "Content-Length")
            request.setValue("*", forHTTPHeaderField: "If-None-Match")
        }

        let (_, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL)
        guard let http = response as? HTTPURLResponse else {
            throw UploadManagerError.badResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw UploadManagerError.http(statusCode: http.statusCode)
        }

        try await store.markState(jobId: job.id, state: .uploaded, nextAttemptAt: Date().timeIntervalSince1970, attemptsDelta: 0, lastError: nil)
    }

    private func pollUntilCompleted(jobId: String) async throws {
        let now = Date().timeIntervalSince1970
        guard let job = try await store.fetchNextRunnable(now: now), job.id == jobId else {
            return
        }

        guard let uploadId = job.uploadId else {
            throw UploadManagerError.missingUploadId
        }

        try await store.markState(jobId: job.id, state: .awaitingCompletion, nextAttemptAt: now, attemptsDelta: 0, lastError: nil)

        let maxPollSeconds: TimeInterval = 45
        let deadline = Date().addingTimeInterval(maxPollSeconds)

        while Date() < deadline {
            if Task.isCancelled { return }
            let statuses = try await api.fetchStatus(uploadIds: [uploadId])
            if let status = statuses.first(where: { $0.uploadId == uploadId }) {
                switch status.status {
                case "completed":
                    try await finalizeCompleted(job: job)
                    return
                case "failed":
                    throw UploadManagerError.remoteFailed(message: status.errorMessage)
                case "expired":
                    // Re-presign and retry.
                    try await ensurePresigned(job)
                    return
                default:
                    break
                }
            }

            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }

        // Not completed yet: schedule a later poll.
        try await store.markState(
            jobId: job.id,
            state: .awaitingCompletion,
            nextAttemptAt: Date().timeIntervalSince1970 + 5,
            attemptsDelta: 0,
            lastError: nil
        )
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

        try await store.markState(jobId: job.id, state: .completed, nextAttemptAt: Date().timeIntervalSince1970, attemptsDelta: 0, lastError: nil)
    }

    private func backoff(job: UploadJobRecord, error: Error) -> (TimeInterval, String) {
        let attempts = max(job.attempts + 1, 1)
        let delay = min(pow(2.0, Double(attempts)), 60.0)
        return (delay, error.localizedDescription)
    }

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
            .appendingPathComponent("sabaipics", isDirectory: true)
            .appendingPathComponent("upload-queue", isDirectory: true)
            .appendingPathComponent("upload-queue.sqlite", isDirectory: false)
    }
}

enum UploadManagerError: Error, LocalizedError {
    case invalidFileURL
    case missingPresign
    case missingUploadId
    case badResponse
    case http(statusCode: Int)
    case remoteFailed(message: String?)

    var errorDescription: String? {
        switch self {
        case .invalidFileURL:
            return "Invalid file URL"
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
