import Foundation
import Testing
@testable import FrameFast

struct UploadJobReducerTests {
    private func makeJob(state: UploadJobState) -> UploadJobRecord {
        UploadJobRecord(
            id: "job-1",
            createdAt: 0,
            updatedAt: 0,
            nextAttemptAt: 0,
            attempts: 0,
            state: state,
            eventId: "event-1",
            localFileURL: "file:///tmp/photo.jpg",
            filename: "photo.jpg",
            contentType: "image/jpeg",
            contentLength: 10,
            uploadId: nil,
            putUrl: nil,
            objectKey: nil,
            expiresAt: nil,
            requiredHeadersJSON: nil,
            lastError: nil
        )
    }

    @Test func effectsQueued() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .queued)
        #expect(reducer.effects(for: job) == [.ensurePresigned, .upload, .checkCompletion])
    }

    @Test func effectsFailed() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .failed)
        #expect(reducer.effects(for: job) == [.ensurePresigned, .upload, .checkCompletion])
    }

    @Test func effectsPresigned() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .presigned)
        #expect(reducer.effects(for: job) == [.upload, .checkCompletion])
    }

    @Test func effectsUploaded() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .uploaded)
        #expect(reducer.effects(for: job) == [.checkCompletion])
    }

    @Test func effectsAwaitingCompletion() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .awaitingCompletion)
        #expect(reducer.effects(for: job) == [.checkCompletion])
    }

    @Test func effectsUploading() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .uploading)
        #expect(reducer.effects(for: job).isEmpty)
    }

    @Test func effectsCompleted() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .completed)
        #expect(reducer.effects(for: job).isEmpty)
    }

    @Test func effectsTerminalFailed() {
        let reducer = UploadJobReducer()
        let job = makeJob(state: .terminalFailed)
        #expect(reducer.effects(for: job).isEmpty)
    }
}
