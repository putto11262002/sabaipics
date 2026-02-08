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

#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
typealias PlatformImage = NSImage
#endif

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
    @Published var image: PlatformImage?
    @Published var fileURL: URL?
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
        self.image = CapturedPhoto.makeImage(from: data)
        self.fileURL = nil
        self.captureDate = captureDate
        self.status = .completed
        self.isDownloading = false
        self.fileSize = data.count
    }

    /// Initialize with UIImage (legacy support)
    init(name: String, image: PlatformImage, captureDate: Date = Date()) {
        self.id = UUID().uuidString
        self.name = name
        self.image = image
        let imageData = CapturedPhoto.makeJPEGData(from: image) ?? Data()
        self.data = imageData
        self.fileURL = nil
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
        self.fileURL = nil
        self.status = .downloading
        self.isDownloading = isDownloading
        self.fileSize = fileSize
    }

    private static func makeImage(from data: Data) -> PlatformImage? {
        #if canImport(UIKit)
        return UIImage(data: data)
        #elseif canImport(AppKit)
        return NSImage(data: data)
        #else
        return nil
        #endif
    }

    private static func makeJPEGData(from image: PlatformImage) -> Data? {
        #if canImport(UIKit)
        return (image as UIImage).jpegData(compressionQuality: 0.9)
        #elseif canImport(AppKit)
        guard let tiff = (image as NSImage).tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) else {
            return nil
        }
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
        #else
        return nil
        #endif
    }
}
