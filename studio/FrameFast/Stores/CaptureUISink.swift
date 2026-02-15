//  CaptureUISink.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation
import SwiftUI

/// UI sink for the capture pipeline.
///
/// Owns the in-memory photo list, two-phase placeholder mapping, and UI-only state.
@MainActor
final class CaptureUISink: ObservableObject {
    // MARK: - Published UI state

    @Published var photos: [CapturedPhoto] = []
    @Published var completedDownloadsCount: Int = 0
    @Published var lastCompletedFilename: String? = nil
    @Published private(set) var startedAt: Date = Date()
    @Published var isActive: Bool = true
    @Published var isDisconnecting: Bool = false
    @Published var errorMessage: String? = nil
    @Published var skippedRawCount: Int = 0
    @Published var showRawSkipBanner: Bool = true

    private var pendingDownloads: [UInt32: CapturedPhoto] = [:]
    private let maxPhotosInMemory: Int

    init(startedAt: Date = Date(), maxPhotosInMemory: Int = 200) {
        self.startedAt = startedAt
        self.maxPhotosInMemory = maxPhotosInMemory
    }

    func handle(_ event: CapturePipelineEvent) {
        switch event {
        case .detected(let detected):
            handleDetected(detected)

        case .downloadedToSpool(let completed):
            handleDownloaded(completed)

        case .rawSkipped(let filename):
            skippedRawCount += 1
            print("[CaptureUISink] RAW file skipped: \(filename) (total: \(skippedRawCount))")

        case .error(let message):
            errorMessage = message

        case .disconnected:
            if isActive {
                errorMessage = "Camera disconnected unexpectedly"
            }
            isActive = false
        }
    }

    func linkUploadJob(objectHandle: UInt32, jobId: String) {
        if let photo = pendingDownloads[objectHandle] {
            photo.uploadJobId = jobId
            return
        }

        let idHex = String(format: "%08X", objectHandle)
        if let photo = photos.first(where: { $0.id == idHex }) {
            photo.uploadJobId = jobId
        }
    }

    private func handleDetected(_ detected: CaptureDetected) {
        let photo = CapturedPhoto(
            id: String(format: "%08X", detected.objectHandle),
            name: detected.filename,
            captureDate: detected.captureDate,
            fileSize: detected.fileSize,
            isDownloading: true
        )

        photos.insert(photo, at: 0)
        pendingDownloads[detected.objectHandle] = photo
        enforceInMemoryRetentionLimit()
    }

    private func handleDownloaded(_ completed: CaptureSpoolCompleted) {
        guard let photo = pendingDownloads[completed.objectHandle] else {
            // Fallback: create a completed photo entry if placeholder is missing.
            let p = CapturedPhoto(
                id: String(format: "%08X", completed.objectHandle),
                name: completed.filename,
                captureDate: completed.captureDate,
                fileSize: completed.fileSize,
                isDownloading: false
            )
            p.fileURL = completed.url
            #if canImport(UIKit)
            p.image = UIImage(contentsOfFile: completed.url.path)
            #elseif canImport(AppKit)
            p.image = NSImage(contentsOf: completed.url)
            #endif
            p.status = .completed
            photos.insert(p, at: 0)
            completedDownloadsCount += 1
            lastCompletedFilename = p.name
            enforceInMemoryRetentionLimit()
            return
        }

        photo.fileURL = completed.url
        // Prefer not to keep full Data in memory; PhotoListRow can fall back to fileSize.
        photo.data = Data()

        #if canImport(UIKit)
        photo.image = UIImage(contentsOfFile: completed.url.path)
        #elseif canImport(AppKit)
        photo.image = NSImage(contentsOf: completed.url)
        #endif

        photo.status = .completed
        photo.isDownloading = false

        pendingDownloads.removeValue(forKey: completed.objectHandle)
        completedDownloadsCount += 1
        lastCompletedFilename = photo.name
        enforceInMemoryRetentionLimit()
    }

    private func enforceInMemoryRetentionLimit() {
        guard maxPhotosInMemory > 0 else { return }
        guard photos.count > maxPhotosInMemory else { return }

        let overflow = photos.count - maxPhotosInMemory
        let dropped = photos.suffix(overflow)
        photos.removeLast(overflow)

        for photo in dropped {
            if let handle = UInt32(photo.id, radix: 16) {
                pendingDownloads.removeValue(forKey: handle)
            }
        }
    }
}
