import Foundation
import SQLite3
import Testing
@testable import FrameFast

struct UploadManagerSQLiteIntegrationTests {
    private func setUpdatedAt(dbURL: URL, jobId: String, updatedAt: TimeInterval) throws {
        let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        var db: OpaquePointer?
        guard sqlite3_open(dbURL.path, &db) == SQLITE_OK else {
            throw TestHarnessError(description: "Failed to open sqlite db")
        }
        defer { sqlite3_close(db) }

        let sql = "UPDATE upload_jobs SET updated_at = ? WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw TestHarnessError(description: "Failed to prepare sqlite statement")
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, updatedAt)
        sqlite3_bind_text(stmt, 2, jobId, -1, SQLITE_TRANSIENT)

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw TestHarnessError(description: "Failed to execute sqlite update")
        }
    }

    @Test func queuedHappyPathCompletesAndDeletesFile() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir, bytes: 12)

        let payload = UploadPresignResponse.DataPayload(
            uploadId: "up-1",
            putUrl: "https://example.invalid/put",
            objectKey: "k-1",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in payload },
            repressign: { _ in payload },
            fetchStatus: { ids in
                ids.map {
                    UploadStatusResponse.Item(
                        uploadId: $0,
                        eventId: "event-1",
                        status: "completed",
                        errorCode: nil,
                        errorMessage: nil,
                        photoId: "p-1",
                        uploadedAt: nil,
                        completedAt: nil,
                        expiresAt: "2100-01-01T00:00:00Z"
                    )
                }
            }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 12
        ))
        clock.set(Date().timeIntervalSince1970)

        await manager.start()

        try await waitUntil {
            let job = try await store.fetch(jobId: jobId)
            return job?.state == .completed
        }

        await manager.stop()

        #expect(!FileManager.default.fileExists(atPath: fileURL.path))
    }

    @Test func expiredPresignTriggersRepressign() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let freshPayload = UploadPresignResponse.DataPayload(
            uploadId: "up-2",
            putUrl: "https://example.invalid/put2",
            objectKey: "k-2",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in freshPayload },
            repressign: { _ in freshPayload },
            fetchStatus: { ids in
                ids.map {
                    UploadStatusResponse.Item(
                        uploadId: $0,
                        eventId: "event-1",
                        status: "completed",
                        errorCode: nil,
                        errorMessage: nil,
                        photoId: "p-2",
                        uploadedAt: nil,
                        completedAt: nil,
                        expiresAt: "2100-01-01T00:00:00Z"
                    )
                }
            }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))

        // Force a presigned state with an expired expiresAt.
        try await store.markPresigned(
            jobId: jobId,
            uploadId: "up-expired",
            putUrl: "https://example.invalid/put-expired",
            objectKey: "k-expired",
            expiresAt: "2000-01-01T00:00:00Z",
            requiredHeadersJSON: "{}"
        )
        clock.set(Date().timeIntervalSince1970)

        await manager.start()
        try await waitUntil {
            let job = try await store.fetch(jobId: jobId)
            return job?.state == .completed
        }
        await manager.stop()

        let calls = await api.repressignCalls
        #expect(calls == 1)
    }

    @Test func unauthenticatedPresignBecomesTerminalFailed() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in
                throw UploadsAPIError.api(statusCode: 401, code: .unauthenticated, message: "no session", retryAfterSeconds: nil)
            },
            repressign: { _ in
                throw UploadsAPIError.api(statusCode: 401, code: .unauthenticated, message: "no session", retryAfterSeconds: nil)
            },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))
        clock.set(Date().timeIntervalSince1970)

        await manager.start()
        try await waitUntil {
            let job = try await store.fetch(jobId: jobId)
            return job?.state == .terminalFailed
        }
        await manager.stop()

        let job = try await store.fetch(jobId: jobId)
        #expect(job?.attempts == 1)
    }

    @Test func rateLimitedPresignSchedulesRetryUsingRetryAfter() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in
                throw UploadsAPIError.api(statusCode: 429, code: .rateLimited, message: "slow down", retryAfterSeconds: 7)
            },
            repressign: { _ in
                throw UploadsAPIError.api(statusCode: 429, code: .rateLimited, message: "slow down", retryAfterSeconds: 7)
            },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))
        clock.set(Date().timeIntervalSince1970)
        let expected = clock.now() + 7

        await manager.start()
        try await waitUntil {
            let job = try await store.fetch(jobId: jobId)
            return job?.state == .failed
        }
        await manager.stop()

        let job = try await store.fetch(jobId: jobId)
        #expect(job?.attempts == 1)
        if let next = job?.nextAttemptAt {
            #expect(abs(next - expected) < 0.5)
        } else {
            throw TestHarnessError(description: "Missing job")
        }
    }

    @Test func stalenessRecoveryDoesNotResetWhenInFlightTaskExists() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let payload = UploadPresignResponse.DataPayload(
            uploadId: "up-3",
            putUrl: "https://example.invalid/put3",
            objectKey: "k-3",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in payload },
            repressign: { _ in payload },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))

        let t = Date().timeIntervalSince1970
        clock.set(t)
        try await store.markState(jobId: jobId, state: .uploading, nextAttemptAt: t)
        try setUpdatedAt(dbURL: dbURL, jobId: jobId, updatedAt: t - 400)

        bg.setInFlightJobIds([jobId])

        await manager.resume()

        let job = try await store.fetch(jobId: jobId)
        #expect(job?.state == .uploading)
    }

    @Test func stalenessRecoveryResetsWhenNoInFlightTaskExists() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let payload = UploadPresignResponse.DataPayload(
            uploadId: "up-4",
            putUrl: "https://example.invalid/put4",
            objectKey: "k-4",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in payload },
            repressign: { _ in payload },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))

        let t = Date().timeIntervalSince1970
        clock.set(t)
        try await store.markState(jobId: jobId, state: .uploading, nextAttemptAt: t)
        try setUpdatedAt(dbURL: dbURL, jobId: jobId, updatedAt: t - 400)

        bg.setInFlightJobIds([])
        await manager.resume()

        let job = try await store.fetch(jobId: jobId)
        #expect(job?.state == .failed)
        #expect(job?.lastError == "recovered: no active URLSessionTask")
    }

    @Test func orphanCompletionSuccessMarksUploaded() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let payload = UploadPresignResponse.DataPayload(
            uploadId: "up-5",
            putUrl: "https://example.invalid/put5",
            objectKey: "k-5",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in payload },
            repressign: { _ in payload },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))

        let t = Date().timeIntervalSince1970
        clock.set(t)
        try await store.markState(jobId: jobId, state: .uploading, nextAttemptAt: t)

        bg.triggerOrphanCompletion(jobId: jobId, statusCode: 200)

        try await waitUntil {
            let job = try await store.fetch(jobId: jobId)
            return job?.state == .uploaded
        }
    }

    @Test func drainOnceStartsBackgroundUploadAndReturns() async throws {
        let dir = try makeTempDirectory()
        let dbURL = dir.appendingPathComponent("upload-queue.sqlite")
        let store = UploadQueueStore(dbURL: dbURL)
        let fileURL = try writeTempFile(dir: dir)

        let payload = UploadPresignResponse.DataPayload(
            uploadId: "up-6",
            putUrl: "https://example.invalid/put6",
            objectKey: "k-6",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeaders: [:]
        )

        let api = FakeUploadsAPIClient(behavior: .init(
            presign: { _ in payload },
            repressign: { _ in payload },
            fetchStatus: { _ in [] }
        ))

        let connectivity = FakeConnectivityService()
        let bg = FakeBackgroundUploadSession()

        let clock = TestClock(Date().timeIntervalSince1970)
        let manager = UploadManager(
            store: store,
            api: api,
            connectivity: connectivity,
            backgroundSession: bg,
            fileManager: .default,
            now: { clock.now() },
            sleepNanoseconds: { _ in await Task.yield() }
        )

        let jobId = try await manager.enqueue(.init(
            eventId: "event-1",
            localFileURL: fileURL,
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10
        ))

        try await store.markPresigned(
            jobId: jobId,
            uploadId: "up-6",
            putUrl: "https://example.invalid/put6",
            objectKey: "k-6",
            expiresAt: "2100-01-01T00:00:00Z",
            requiredHeadersJSON: "{}"
        )
        clock.set(Date().timeIntervalSince1970)

        await manager.drainOnce()

        #expect(bg.startUploadCalls == 1)
        let job = try await store.fetch(jobId: jobId)
        #expect(job?.state == .uploading)
    }
}
