//  UploadQueueSink.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation

/// Adapter from capture pipeline events -> UploadManager queue.
///
/// This sink does not perform network uploads; it only enqueues durable jobs.
struct UploadQueueSink: Sendable {
    let uploadManager: UploadManager
    let eventIdProvider: @Sendable () async -> String?
    let onEnqueued: @Sendable (_ objectHandle: UInt32, _ jobId: String) async -> Void

    func asSink() -> AnyCaptureEventSink {
        AnyCaptureEventSink { [uploadManager, eventIdProvider, onEnqueued] event in
            guard case .downloadedToSpool(let completed) = event else { return }
            guard let eventId = await eventIdProvider() else {
                print("[UploadQueueSink] No selected eventId; skipping enqueue for \(completed.filename)")
                return
            }

            // For now the pipeline produces JPEG URLs.
            // If we later store HEIC/PNG, contentType should be inferred from URL or passed in.
            let request = UploadManager.EnqueueRequest(
                eventId: eventId,
                localFileURL: completed.url,
                filename: completed.filename,
                contentType: "image/jpeg",
                contentLength: completed.bytesWritten
            )

            do {
                let jobId = try await uploadManager.enqueue(request)
                print("[UploadQueueSink] Enqueued upload job \(jobId) for \(completed.filename) -> event \(eventId)")
                await onEnqueued(completed.objectHandle, jobId)
            } catch {
                print("[UploadQueueSink] Failed to enqueue upload job: \(error)")
            }
        }
    }
}
