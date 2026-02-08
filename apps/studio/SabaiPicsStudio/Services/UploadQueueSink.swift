//  UploadQueueSink.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation

/// Adapter from capture pipeline events -> UploadManager queue.
///
/// This sink does not perform network uploads; it only enqueues durable jobs.
struct UploadQueueSink: Sendable {
    let uploadManager: UploadManager
    let eventIdProvider: @Sendable () -> String?

    func asSink() -> AnyCaptureEventSink {
        AnyCaptureEventSink { [uploadManager, eventIdProvider] event in
            guard case .downloadedToSpool(let completed) = event else { return }
            guard let eventId = eventIdProvider() else {
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
                _ = try await uploadManager.enqueue(request)
            } catch {
                print("[UploadQueueSink] Failed to enqueue upload job: \(error)")
            }
        }
    }
}
