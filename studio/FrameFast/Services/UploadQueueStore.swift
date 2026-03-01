//  UploadQueueStore.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

enum UploadJobState: String, Sendable {
    case queued
    case presigned
    case uploading
    case uploaded
    case awaitingCompletion
    case completed
    case failed
    case terminalFailed
}

struct UploadJobRecord: Sendable {
    let id: String
    let createdAt: TimeInterval
    let updatedAt: TimeInterval
    let nextAttemptAt: TimeInterval
    let attempts: Int
    let state: UploadJobState
    let eventId: String
    let localFileURL: String
    let filename: String
    let contentType: String
    let contentLength: Int

    let uploadId: String?
    let putUrl: String?
    let objectKey: String?
    let expiresAt: String?
    let requiredHeadersJSON: String?

    let lastError: String?
}

struct StorageSummary: Sendable {
    let totalBytes: Int64, totalFiles: Int
    let completedBytes: Int64, completedFiles: Int
    let pendingBytes: Int64, pendingFiles: Int
    let failedBytes: Int64, failedFiles: Int
}

/// Minimal durable queue store backed by SQLite.
actor UploadQueueStore {
    private let dbURL: URL
    private var db: OpaquePointer?

    init(dbURL: URL) {
        self.dbURL = dbURL
    }

    deinit {
        if let db {
            sqlite3_close(db)
        }
    }

    func openAndMigrateIfNeeded() throws {
        if db != nil { return }

        try FileManager.default.createDirectory(at: dbURL.deletingLastPathComponent(), withIntermediateDirectories: true)

        var conn: OpaquePointer?
        if sqlite3_open(dbURL.path, &conn) != SQLITE_OK {
            throw UploadQueueStoreError.openFailed(message: "Failed to open upload queue DB")
        }

        db = conn
        try exec("PRAGMA journal_mode=WAL;")
        try exec("PRAGMA synchronous=NORMAL;")

        try exec(
            """
            CREATE TABLE IF NOT EXISTS upload_jobs (
              id TEXT PRIMARY KEY,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL,
              next_attempt_at REAL NOT NULL,
              attempts INTEGER NOT NULL,
              state TEXT NOT NULL,

              event_id TEXT NOT NULL,
              local_file_url TEXT NOT NULL,
              filename TEXT NOT NULL,
              content_type TEXT NOT NULL,
              content_length INTEGER NOT NULL,

              upload_id TEXT,
              put_url TEXT,
              object_key TEXT,
              expires_at TEXT,
              required_headers_json TEXT,

              last_error TEXT
            );
            """
        )

        try exec("CREATE INDEX IF NOT EXISTS upload_jobs_state_next_idx ON upload_jobs(state, next_attempt_at);")
    }

    func enqueue(
        eventId: String,
        localFileURL: URL,
        filename: String,
        contentType: String,
        contentLength: Int
    ) throws -> String {
        try openAndMigrateIfNeeded()

        let id = UUID().uuidString
        let now = Date().timeIntervalSince1970

        let sql = """
        INSERT INTO upload_jobs(
          id, created_at, updated_at, next_attempt_at, attempts, state,
          event_id, local_file_url, filename, content_type, content_length
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT)
        sqlite3_bind_double(stmt, 2, now)
        sqlite3_bind_double(stmt, 3, now)
        sqlite3_bind_double(stmt, 4, now)
        sqlite3_bind_int(stmt, 5, 0)
        sqlite3_bind_text(stmt, 6, UploadJobState.queued.rawValue, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 7, eventId, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 8, localFileURL.absoluteString, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 9, filename, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 10, contentType, -1, SQLITE_TRANSIENT)
        sqlite3_bind_int(stmt, 11, Int32(contentLength))

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }

        return id
    }

    func fetchNextRunnable(now: TimeInterval) throws -> UploadJobRecord? {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT
          id, created_at, updated_at, next_attempt_at, attempts, state,
          event_id, local_file_url, filename, content_type, content_length,
          upload_id, put_url, object_key, expires_at, required_headers_json,
          last_error
        FROM upload_jobs
        WHERE state IN ('queued','presigned','uploaded','awaitingCompletion','failed')
          AND next_attempt_at <= ?
        ORDER BY next_attempt_at ASC
        LIMIT 1;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, now)

        guard sqlite3_step(stmt) == SQLITE_ROW else {
            return nil
        }

        return try readJob(stmt: stmt)
    }

    /// Atomically fetch and claim the next runnable job.
    ///
    /// This prevents multiple processors (or multiple async loops) from selecting the same row
    /// between `fetchNextRunnable` and `markClaimed`.
    func claimNextRunnable(now: TimeInterval, holdSeconds: TimeInterval = 10) throws -> UploadJobRecord? {
        try openAndMigrateIfNeeded()

        do {
            try exec("BEGIN IMMEDIATE;")

            let sql = """
            SELECT
              id, created_at, updated_at, next_attempt_at, attempts, state,
              event_id, local_file_url, filename, content_type, content_length,
              upload_id, put_url, object_key, expires_at, required_headers_json,
              last_error
            FROM upload_jobs
            WHERE state IN ('queued','presigned','uploaded','awaitingCompletion','failed')
              AND next_attempt_at <= ?
            ORDER BY next_attempt_at ASC
            LIMIT 1;
            """

            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
                throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
            }
            defer { sqlite3_finalize(stmt) }

            sqlite3_bind_double(stmt, 1, now)

            guard sqlite3_step(stmt) == SQLITE_ROW else {
                try exec("COMMIT;")
                return nil
            }

            let job = try readJob(stmt: stmt)

            let updateSQL = """
            UPDATE upload_jobs
            SET updated_at = ?,
                next_attempt_at = ?
            WHERE id = ?;
            """

            var updateStmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, updateSQL, -1, &updateStmt, nil) == SQLITE_OK else {
                throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
            }
            defer { sqlite3_finalize(updateStmt) }

            sqlite3_bind_double(updateStmt, 1, now)
            sqlite3_bind_double(updateStmt, 2, now + holdSeconds)
            sqlite3_bind_text(updateStmt, 3, job.id, -1, SQLITE_TRANSIENT)

            guard sqlite3_step(updateStmt) == SQLITE_DONE else {
                throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
            }

            try exec("COMMIT;")
            return job
        } catch {
            try? exec("ROLLBACK;")
            throw error
        }
    }

    func markClaimed(jobId: String, holdSeconds: TimeInterval = 10) throws {
        try openAndMigrateIfNeeded()
        let now = Date().timeIntervalSince1970

        let sql = """
        UPDATE upload_jobs
        SET updated_at = ?,
            next_attempt_at = ?
        WHERE id = ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, now)
        sqlite3_bind_double(stmt, 2, now + holdSeconds)
        sqlite3_bind_text(stmt, 3, jobId, -1, SQLITE_TRANSIENT)

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }
    }

    func fetch(jobId: String) throws -> UploadJobRecord? {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT
          id, created_at, updated_at, next_attempt_at, attempts, state,
          event_id, local_file_url, filename, content_type, content_length,
          upload_id, put_url, object_key, expires_at, required_headers_json,
          last_error
        FROM upload_jobs
        WHERE id = ?
        LIMIT 1;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, jobId, -1, SQLITE_TRANSIENT)

        guard sqlite3_step(stmt) == SQLITE_ROW else {
            return nil
        }

        return try readJob(stmt: stmt)
    }

    func markPresigned(
        jobId: String,
        uploadId: String,
        putUrl: String,
        objectKey: String,
        expiresAt: String,
        requiredHeadersJSON: String
    ) throws {
        try updateJob(
            jobId: jobId,
            state: .presigned,
            nextAttemptAt: Date().timeIntervalSince1970,
            attemptsDelta: 0,
            lastError: nil,
            uploadId: uploadId,
            putUrl: putUrl,
            objectKey: objectKey,
            expiresAt: expiresAt,
            requiredHeadersJSON: requiredHeadersJSON
        )
    }

    func markState(
        jobId: String,
        state: UploadJobState,
        nextAttemptAt: TimeInterval,
        attemptsDelta: Int = 0,
        lastError: String? = nil
    ) throws {
        try updateJob(
            jobId: jobId,
            state: state,
            nextAttemptAt: nextAttemptAt,
            attemptsDelta: attemptsDelta,
            lastError: lastError,
            uploadId: nil,
            putUrl: nil,
            objectKey: nil,
            expiresAt: nil,
            requiredHeadersJSON: nil
        )
    }

    /// Reset all jobs stuck in `uploading` state from before `staleBefore` to `failed`.
    /// Returns the number of recovered rows.
    func resetStaleUploadingJobs(staleBefore: TimeInterval) throws -> Int {
        try openAndMigrateIfNeeded()

        let sql = """
        UPDATE upload_jobs
        SET state = ?,
            updated_at = ?,
            next_attempt_at = ?,
            last_error = 'recovered: app terminated during upload'
        WHERE state = 'uploading'
          AND updated_at < ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        let now = Date().timeIntervalSince1970
        sqlite3_bind_text(stmt, 1, UploadJobState.failed.rawValue, -1, SQLITE_TRANSIENT)
        sqlite3_bind_double(stmt, 2, now)
        sqlite3_bind_double(stmt, 3, now)
        sqlite3_bind_double(stmt, 4, staleBefore)

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }

        return Int(sqlite3_changes(db))
    }

    func fetchUploadingJobIds(updatedBefore: TimeInterval) throws -> [String] {
        try openAndMigrateIfNeeded()

        let sql = "SELECT id FROM upload_jobs WHERE state = 'uploading' AND updated_at < ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, updatedBefore)

        var result: [String] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let idC = sqlite3_column_text(stmt, 0) else { continue }
            result.append(String(cString: idC))
        }
        return result
    }

    func delete(jobId: String) throws {
        try openAndMigrateIfNeeded()

        let sql = "DELETE FROM upload_jobs WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, jobId, -1, SQLITE_TRANSIENT)
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }
    }

    func fetchCountsByState() throws -> [UploadJobState: Int] {
        try openAndMigrateIfNeeded()

        let sql = "SELECT state, COUNT(*) FROM upload_jobs GROUP BY state;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        var result: [UploadJobState: Int] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let stateC = sqlite3_column_text(stmt, 0) else { continue }
            let stateRaw = String(cString: stateC)
            let count = Int(sqlite3_column_int(stmt, 1))
            if let state = UploadJobState(rawValue: stateRaw) {
                result[state] = count
            }
        }
        return result
    }

    func fetchCountsByEventAndState() throws -> [String: [UploadJobState: Int]] {
        try openAndMigrateIfNeeded()

        let sql = "SELECT event_id, state, COUNT(*) FROM upload_jobs GROUP BY event_id, state;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        var result: [String: [UploadJobState: Int]] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let eventC = sqlite3_column_text(stmt, 0) else { continue }
            guard let stateC = sqlite3_column_text(stmt, 1) else { continue }
            let eventId = String(cString: eventC)
            let stateRaw = String(cString: stateC)
            let count = Int(sqlite3_column_int(stmt, 2))
            guard let state = UploadJobState(rawValue: stateRaw) else { continue }

            var counts = result[eventId] ?? [:]
            counts[state] = count
            result[eventId] = counts
        }

        return result
    }

    func countCompletedJobs(updatedAfter: TimeInterval) throws -> Int {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT COUNT(*)
        FROM upload_jobs
        WHERE state = 'completed'
          AND updated_at >= ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, updatedAfter)

        guard sqlite3_step(stmt) == SQLITE_ROW else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }

        return Int(sqlite3_column_int(stmt, 0))
    }

    func fetchRecentJobStates(limit: Int) throws -> [String: UploadJobState] {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT id, state
        FROM upload_jobs
        ORDER BY updated_at DESC
        LIMIT ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_int(stmt, 1, Int32(limit))

        var result: [String: UploadJobState] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let idC = sqlite3_column_text(stmt, 0) else { continue }
            guard let stateC = sqlite3_column_text(stmt, 1) else { continue }
            let id = String(cString: idC)
            let stateRaw = String(cString: stateC)
            if let state = UploadJobState(rawValue: stateRaw) {
                result[id] = state
            }
        }
        return result
    }

    // MARK: - Cleanup Queries

    /// Fetch jobs in a terminal state (`completed` or `terminalFailed`) updated before `cutoff`.
    func fetchExpiredJobs(state: UploadJobState, updatedBefore cutoff: TimeInterval, limit: Int = 500) throws -> [UploadJobRecord] {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT
          id, created_at, updated_at, next_attempt_at, attempts, state,
          event_id, local_file_url, filename, content_type, content_length,
          upload_id, put_url, object_key, expires_at, required_headers_json,
          last_error
        FROM upload_jobs
        WHERE state = ?
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, state.rawValue, -1, SQLITE_TRANSIENT)
        sqlite3_bind_double(stmt, 2, cutoff)
        sqlite3_bind_int(stmt, 3, Int32(limit))

        var result: [UploadJobRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            result.append(try readJob(stmt: stmt))
        }
        return result
    }

    /// Fetch all jobs in a given state (no time filter).
    func fetchAllJobs(state: UploadJobState) throws -> [UploadJobRecord] {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT
          id, created_at, updated_at, next_attempt_at, attempts, state,
          event_id, local_file_url, filename, content_type, content_length,
          upload_id, put_url, object_key, expires_at, required_headers_json,
          last_error
        FROM upload_jobs
        WHERE state = ?
        ORDER BY updated_at ASC;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, state.rawValue, -1, SQLITE_TRANSIENT)

        var result: [UploadJobRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            result.append(try readJob(stmt: stmt))
        }
        return result
    }

    /// Batch delete jobs by IDs (chunked to respect SQLite's 999 parameter limit).
    func deleteJobs(ids: [String]) throws {
        guard !ids.isEmpty else { return }
        try openAndMigrateIfNeeded()

        let batchSize = 500
        for batch in stride(from: 0, to: ids.count, by: batchSize) {
            let chunk = Array(ids[batch..<min(batch + batchSize, ids.count)])
            let placeholders = chunk.map { _ in "?" }.joined(separator: ",")
            let sql = "DELETE FROM upload_jobs WHERE id IN (\(placeholders));"

            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
                throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
            }
            defer { sqlite3_finalize(stmt) }

            for (i, id) in chunk.enumerated() {
                sqlite3_bind_text(stmt, Int32(i + 1), id, -1, SQLITE_TRANSIENT)
            }

            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
            }
        }
    }

    /// Aggregate bytes and file counts by state for storage summary.
    func fetchStorageSummary() throws -> StorageSummary {
        try openAndMigrateIfNeeded()

        let sql = """
        SELECT state, COUNT(*), COALESCE(SUM(content_length), 0)
        FROM upload_jobs
        GROUP BY state;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        var completedBytes: Int64 = 0, completedFiles = 0
        var pendingBytes: Int64 = 0, pendingFiles = 0
        var failedBytes: Int64 = 0, failedFiles = 0

        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let stateC = sqlite3_column_text(stmt, 0) else { continue }
            let stateRaw = String(cString: stateC)
            let count = Int(sqlite3_column_int(stmt, 1))
            let bytes = sqlite3_column_int64(stmt, 2)

            switch UploadJobState(rawValue: stateRaw) {
            case .completed:
                completedFiles += count
                completedBytes += bytes
            case .terminalFailed:
                failedFiles += count
                failedBytes += bytes
            case .queued, .presigned, .uploading, .uploaded, .awaitingCompletion, .failed:
                pendingFiles += count
                pendingBytes += bytes
            case nil:
                break
            }
        }

        let totalFiles = completedFiles + pendingFiles + failedFiles
        let totalBytes = completedBytes + pendingBytes + failedBytes

        return StorageSummary(
            totalBytes: totalBytes,
            totalFiles: totalFiles,
            completedBytes: completedBytes,
            completedFiles: completedFiles,
            pendingBytes: pendingBytes,
            pendingFiles: pendingFiles,
            failedBytes: failedBytes,
            failedFiles: failedFiles
        )
    }

    // MARK: - Internals

    private func updateJob(
        jobId: String,
        state: UploadJobState,
        nextAttemptAt: TimeInterval,
        attemptsDelta: Int,
        lastError: String?,
        uploadId: String?,
        putUrl: String?,
        objectKey: String?,
        expiresAt: String?,
        requiredHeadersJSON: String?
    ) throws {
        try openAndMigrateIfNeeded()
        let now = Date().timeIntervalSince1970

        let sql = """
        UPDATE upload_jobs
        SET updated_at = ?,
            next_attempt_at = ?,
            attempts = attempts + ?,
            state = ?,
            last_error = ?,
            upload_id = COALESCE(?, upload_id),
            put_url = COALESCE(?, put_url),
            object_key = COALESCE(?, object_key),
            expires_at = COALESCE(?, expires_at),
            required_headers_json = COALESCE(?, required_headers_json)
        WHERE id = ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.prepareFailed(message: lastErrorMessage())
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, now)
        sqlite3_bind_double(stmt, 2, nextAttemptAt)
        sqlite3_bind_int(stmt, 3, Int32(attemptsDelta))
        sqlite3_bind_text(stmt, 4, state.rawValue, -1, SQLITE_TRANSIENT)

        if let lastError {
            sqlite3_bind_text(stmt, 5, lastError, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(stmt, 5)
        }

        bindOptionalText(stmt, index: 6, value: uploadId)
        bindOptionalText(stmt, index: 7, value: putUrl)
        bindOptionalText(stmt, index: 8, value: objectKey)
        bindOptionalText(stmt, index: 9, value: expiresAt)
        bindOptionalText(stmt, index: 10, value: requiredHeadersJSON)
        sqlite3_bind_text(stmt, 11, jobId, -1, SQLITE_TRANSIENT)

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw UploadQueueStoreError.stepFailed(message: lastErrorMessage())
        }
    }

    private func readJob(stmt: OpaquePointer?) throws -> UploadJobRecord {
        func colText(_ i: Int32) -> String? {
            guard let c = sqlite3_column_text(stmt, i) else { return nil }
            return String(cString: c)
        }

        let id = colText(0) ?? ""
        let createdAt = sqlite3_column_double(stmt, 1)
        let updatedAt = sqlite3_column_double(stmt, 2)
        let nextAttemptAt = sqlite3_column_double(stmt, 3)
        let attempts = Int(sqlite3_column_int(stmt, 4))
        let stateRaw = colText(5) ?? UploadJobState.queued.rawValue
        let state = UploadJobState(rawValue: stateRaw) ?? .queued

        let eventId = colText(6) ?? ""
        let localFileURL = colText(7) ?? ""
        let filename = colText(8) ?? ""
        let contentType = colText(9) ?? "image/jpeg"
        let contentLength = Int(sqlite3_column_int(stmt, 10))

        let uploadId = colText(11)
        let putUrl = colText(12)
        let objectKey = colText(13)
        let expiresAt = colText(14)
        let requiredHeadersJSON = colText(15)
        let lastError = colText(16)

        return UploadJobRecord(
            id: id,
            createdAt: createdAt,
            updatedAt: updatedAt,
            nextAttemptAt: nextAttemptAt,
            attempts: attempts,
            state: state,
            eventId: eventId,
            localFileURL: localFileURL,
            filename: filename,
            contentType: contentType,
            contentLength: contentLength,
            uploadId: uploadId,
            putUrl: putUrl,
            objectKey: objectKey,
            expiresAt: expiresAt,
            requiredHeadersJSON: requiredHeadersJSON,
            lastError: lastError
        )
    }

    private func exec(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
            throw UploadQueueStoreError.execFailed(message: lastErrorMessage())
        }
    }

    private func lastErrorMessage() -> String {
        if let c = sqlite3_errmsg(db) {
            return String(cString: c)
        }
        return "SQLite error"
    }

    private func bindOptionalText(_ stmt: OpaquePointer?, index: Int32, value: String?) {
        if let value {
            sqlite3_bind_text(stmt, index, value, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(stmt, index)
        }
    }
}

enum UploadQueueStoreError: Error, LocalizedError {
    case openFailed(message: String)
    case execFailed(message: String)
    case prepareFailed(message: String)
    case stepFailed(message: String)

    var errorDescription: String? {
        switch self {
        case .openFailed(let message),
             .execFailed(let message),
             .prepareFailed(let message),
             .stepFailed(let message):
            return message
        }
    }
}
