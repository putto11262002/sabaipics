//
//  CapturedPhoto.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 5: Architecture Refactoring - CapturedPhoto Extraction
//  Updated: 2026-01-30 - Added download status tracking for progressive loading
//
//  Represents a captured photo with metadata and image data.
//  Extracted from CameraViewModel.swift during Phase 5 cleanup.
//

import Foundation
import SwiftUI

/// Download status for a photo
enum DownloadStatus {
    case downloading
    case completed
    case failed(Error)
}

/// Represents a captured photo
/// Changed to class with @Published properties to support progressive loading UI
class CapturedPhoto: Identifiable, ObservableObject, Equatable {
    let id: String
    @Published var name: String
    let captureDate: Date
    @Published var data: Data
    @Published var image: UIImage?
    @Published var status: DownloadStatus
    @Published var isDownloading: Bool
    let fileSize: Int

    static func == (lhs: CapturedPhoto, rhs: CapturedPhoto) -> Bool {
        lhs.id == rhs.id
    }

    /// Initialize with complete photo data (legacy support)
    init(name: String, data: Data, captureDate: Date = Date()) {
        self.id = UUID().uuidString
        self.name = name
        self.data = data
        self.image = UIImage(data: data)
        self.captureDate = captureDate
        self.status = .completed
        self.isDownloading = false
        self.fileSize = data.count
    }

    /// Initialize with UIImage (legacy support)
    init(name: String, image: UIImage, captureDate: Date = Date()) {
        self.id = UUID().uuidString
        self.name = name
        self.image = image
        // Convert UIImage to JPEG data
        let imageData = image.jpegData(compressionQuality: 0.9) ?? Data()
        self.data = imageData
        self.captureDate = captureDate
        self.status = .completed
        self.isDownloading = false
        self.fileSize = imageData.count
    }

    /// Initialize as placeholder (photo detected, download in progress)
    init(
        id: String,
        name: String,
        captureDate: Date,
        fileSize: Int,
        isDownloading: Bool = true
    ) {
        self.id = id
        self.name = name
        self.captureDate = captureDate
        self.data = Data()
        self.image = nil
        self.status = .downloading
        self.isDownloading = isDownloading
        self.fileSize = fileSize
    }
}
