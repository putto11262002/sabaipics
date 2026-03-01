//  CaptureEventPipeline.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation

/// Session-owned capture pipeline.
///
/// - Receives PTP/IP callbacks (detected + downloaded bytes).
/// - Spools completed downloads to disk (URL boundary).
/// - Fan-outs normalized events to sinks (UI, upload queue, photo library, etc.).
actor CaptureEventPipeline {
    private let fileService: SpoolFileService
    private let eventId: String
    private var sinks: [AnyCaptureEventSink]

    init(fileService: SpoolFileService, eventId: String, sinks: [AnyCaptureEventSink]) {
        self.fileService = fileService
        self.eventId = eventId
        self.sinks = sinks
    }

    func setSinks(_ sinks: [AnyCaptureEventSink]) {
        self.sinks = sinks
    }

    func publishDetected(_ detected: CaptureDetected) async {
        await publish(.detected(detected))
    }

    func publishRawSkipped(filename: String) async {
        await publish(.rawSkipped(filename: filename))
    }

    func publishDisconnected() async {
        await publish(.disconnected)
    }

    func publishError(_ message: String) async {
        await publish(.error(message: message))
    }

    func publishDownloadedBytes(objectHandle: UInt32, filename: String, captureDate: Date, fileSize: Int, data: Data) async {
        do {
            let hex = String(format: "%08X", objectHandle)
            let item = try await fileService.store(data: data, eventId: eventId, preferredFilename: filename, handleHex: hex)
            let completed = CaptureSpoolCompleted(
                objectHandle: objectHandle,
                filename: filename,
                captureDate: captureDate,
                fileSize: fileSize,
                url: item.url,
                bytesWritten: item.bytes
            )
            await publish(.downloadedToSpool(completed))
        } catch {
            await publish(.error(message: "Failed to spool photo: \(error.localizedDescription)"))
        }
    }

    private func publish(_ event: CapturePipelineEvent) async {
        for sink in sinks {
            await sink.handle(event)
        }
    }
}

struct AnyCaptureEventSink: Sendable {
    private let _handle: @Sendable (CapturePipelineEvent) async -> Void

    init(_ handle: @escaping @Sendable (CapturePipelineEvent) async -> Void) {
        self._handle = handle
    }

    func handle(_ event: CapturePipelineEvent) async {
        await _handle(event)
    }
}
