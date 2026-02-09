//  CaptureSessionController.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation

/// Orchestrates the capture pipeline for an active camera.
///
/// - Owns the ActiveCamera lifecycle (start monitoring, disconnect).
/// - Receives PTP/IP delegate callbacks.
/// - Normalizes events into the capture pipeline (spool + sinks).
@MainActor
final class CaptureSessionController: ObservableObject {
    let cameraName: String
    let cameraIP: String

    let ui: CaptureUISink

    private var camera: ActiveCamera?
    private let spool: CaptureSpool
    private let pipeline: CaptureEventPipeline

    private var detectedByHandle: [UInt32: CaptureDetected] = [:]

    init(activeCamera: ActiveCamera, makeExtraSinks: (CaptureUISink) -> [AnyCaptureEventSink] = { _ in [] }) {
        self.camera = activeCamera
        self.cameraName = activeCamera.name
        self.cameraIP = activeCamera.ipAddress

        self.ui = CaptureUISink(startedAt: Date(), maxPhotosInMemory: 200)
        self.spool = CaptureSpool()

        var sinks: [AnyCaptureEventSink] = []
        sinks.append(
            AnyCaptureEventSink { [weak ui] (event: CapturePipelineEvent) in
                await MainActor.run {
                    ui?.handle(event)
                }
            }
        )
        sinks.append(contentsOf: makeExtraSinks(self.ui))

        self.pipeline = CaptureEventPipeline(spool: spool, sinks: sinks)

        // Bind PTP session delegate
        activeCamera.session.delegate = self

        // Start monitoring immediately.
        activeCamera.startMonitoring()
    }

    func end() async {
        guard ui.isActive else { return }
        ui.isDisconnecting = true
        ui.isActive = false

        if let camera {
            await camera.disconnect()
        }
        camera = nil
        ui.isDisconnecting = false
    }
}

// MARK: - PTPIPSessionDelegate

extension CaptureSessionController: PTPIPSessionDelegate {
    func sessionDidConnect(_ session: PTPIPSession) {
        // No-op; controller is created after connect.
    }

    func session(
        _ session: PTPIPSession,
        didDetectPhoto objectHandle: UInt32,
        filename: String,
        captureDate: Date,
        fileSize: Int
    ) {
        let detected = CaptureDetected(objectHandle: objectHandle, filename: filename, captureDate: captureDate, fileSize: fileSize)
        detectedByHandle[objectHandle] = detected
        Task { [pipeline] in
            await pipeline.publishDetected(detected)
        }
    }

    func session(_ session: PTPIPSession, didCompleteDownload objectHandle: UInt32, data: Data) {
        let detected = detectedByHandle[objectHandle]
        detectedByHandle.removeValue(forKey: objectHandle)

        let filename = detected?.filename ?? "IMG_\(String(format: "%08X", objectHandle)).jpg"
        let date = detected?.captureDate ?? Date()
        let size = detected?.fileSize ?? data.count

        Task { [pipeline] in
            await pipeline.publishDownloadedBytes(
                objectHandle: objectHandle,
                filename: filename,
                captureDate: date,
                fileSize: size,
                data: data
            )
        }
    }

    func session(_ session: PTPIPSession, didDownloadPhoto data: Data, objectHandle: UInt32) {
        // Legacy; keep as no-op.
    }

    func session(_ session: PTPIPSession, didFailWithError error: Error) {
        Task { [pipeline] in
            await pipeline.publishError(error.localizedDescription)
        }
    }

    func session(_ session: PTPIPSession, didSkipRawFile filename: String) {
        Task { [pipeline] in
            await pipeline.publishRawSkipped(filename: filename)
        }
    }

    func sessionDidDisconnect(_ session: PTPIPSession) {
        Task { [pipeline] in
            await pipeline.publishDisconnected()
        }
    }
}
