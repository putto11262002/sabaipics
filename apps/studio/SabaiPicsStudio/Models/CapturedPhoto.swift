//
//  CapturedPhoto.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 5: Architecture Refactoring - CapturedPhoto Extraction
//
//  Represents a captured photo with metadata and image data.
//  Extracted from CameraViewModel.swift during Phase 5 cleanup.
//

import Foundation
import SwiftUI

/// Represents a captured photo
struct CapturedPhoto: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let data: Data
    let image: UIImage?
    let captureDate: Date
    var isDownloading: Bool = false

    static func == (lhs: CapturedPhoto, rhs: CapturedPhoto) -> Bool {
        lhs.id == rhs.id
    }

    init(name: String, data: Data, captureDate: Date = Date()) {
        self.name = name
        self.data = data
        self.image = UIImage(data: data)
        self.captureDate = captureDate
    }

    init(name: String, image: UIImage, captureDate: Date = Date()) {
        self.name = name
        self.image = image
        // Convert UIImage to JPEG data
        self.data = image.jpegData(compressionQuality: 0.9) ?? Data()
        self.captureDate = captureDate
    }
}
