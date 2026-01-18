//
//  PhotoStore.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 2: Architecture Refactoring - Photo Store
//
//  Focused on photo management only.
//  Extracted from CameraViewModel god object.
//

import Foundation
import Combine
import UIKit

/// Store managing captured photos and photo-related state
/// - Subscribes to CameraServiceProtocol photo publishers
/// - Manages photo collection (deduplication, ordering)
/// - Handles photo clearing on disconnect
class PhotoStore: ObservableObject {
    // MARK: - Published State

    /// Array of captured photos (newest first)
    @Published var photos: [CapturedPhoto] = []

    /// Total count of photos in collection
    @Published var photoCount: Int = 0

    /// Count of detected photos (not yet downloaded)
    @Published var detectedCount: Int = 0

    // MARK: - Dependencies

    /// Camera service (injected via protocol for testability)
    private let cameraService: any CameraServiceProtocol

    /// Combine subscriptions storage
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    /// Initialize photo store with camera service
    /// - Parameter cameraService: Service conforming to CameraServiceProtocol
    init(cameraService: any CameraServiceProtocol) {
        self.cameraService = cameraService
        setupSubscriptions()
    }

    // MARK: - Public Actions

    /// Clear all photos from the collection
    func clearPhotos() {
        print("[PhotoStore] Clearing all photos")
        photos.removeAll()
        photoCount = 0
        detectedCount = 0
    }

    // MARK: - Private Methods

    /// Setup Combine subscriptions to service publishers
    /// Note: We subscribe by directly accessing the concrete service type
    /// This is necessary because protocols can't expose @Published property wrappers
    private func setupSubscriptions() {
        print("[PhotoStore] Setting up service subscriptions")

        // Subscribe using concrete type (WiFiCameraService or MockCameraService)
        // Both expose @Published properties that we can observe
        if let wifiService = cameraService as? WiFiCameraService {
            subscribeToWiFiService(wifiService)
        } else if let mockService = cameraService as? MockCameraService {
            subscribeToMockService(mockService)
        } else {
            print("[PhotoStore] Unknown service type, subscriptions not set up")
        }
    }

    /// Subscribe to WiFiCameraService publishers
    private func subscribeToWiFiService(_ service: WiFiCameraService) {
        // Subscribe to detected photos (for counter only)
        service.$detectedPhotos
            .map { $0.count }
            .assign(to: &$detectedCount)

        // Subscribe to downloaded photos
        service.$downloadedPhotos
            .sink { [weak self] newDownloads in
                self?.processDownloadedPhotos(newDownloads)
            }
            .store(in: &cancellables)
    }

    /// Subscribe to MockCameraService publishers
    private func subscribeToMockService(_ service: MockCameraService) {
        // Subscribe to detected photos (for counter only)
        service.$detectedPhotos
            .map { $0.count }
            .assign(to: &$detectedCount)

        // Subscribe to downloaded photos
        service.$downloadedPhotos
            .sink { [weak self] newDownloads in
                self?.processDownloadedPhotos(newDownloads)
            }
            .store(in: &cancellables)
    }

    /// Process downloaded photos from service
    /// Handles deduplication and prepending to collection
    /// - Parameter downloads: Array of downloaded photos (filename, data)
    private func processDownloadedPhotos(_ downloads: [(filename: String, data: Data)]) {
        print("[PhotoStore] Processing \(downloads.count) downloaded photos")

        for (filename, data) in downloads {
            // Check if already added (deduplication)
            let alreadyAdded = photos.contains { $0.name == filename }
            guard !alreadyAdded else {
                print("[PhotoStore] Photo already exists, skipping: \(filename)")
                continue
            }

            // Create UIImage from data
            if let image = UIImage(data: data) {
                addPhoto(filename: filename, image: image, data: data)
            } else {
                print("[PhotoStore] Failed to create image from data: \(filename)")
            }
        }
    }

    /// Add a new photo to the collection (deduplicated, prepended to top)
    /// - Parameters:
    ///   - filename: Photo filename
    ///   - image: UIImage data
    ///   - data: Raw photo data
    private func addPhoto(filename: String, image: UIImage, data: Data) {
        // Deduplication check
        guard !photos.contains(where: { $0.name == filename }) else {
            print("[PhotoStore] Photo already exists, skipping: \(filename)")
            return
        }

        // Create photo object with data
        let photo = CapturedPhoto(name: filename, data: data)

        // Prepend to top (newest first)
        photos.insert(photo, at: 0)
        photoCount = photos.count

        print("[PhotoStore] Added photo to collection: \(filename) (total: \(photoCount))")
    }
}

// MARK: - Example Usage

/*
 Example 1: Real camera

 ```swift
 let service = WiFiCameraService()
 let photoStore = PhotoStore(cameraService: service)

 // Photos automatically added when service downloads them
 // photoStore.photos automatically updated via Combine subscription

 // Clear photos
 photoStore.clearPhotos()
 ```

 Example 2: Mock camera (for testing/previews)

 ```swift
 let mockService = MockCameraService()
 let photoStore = PhotoStore(cameraService: mockService)

 // Simulate photo download
 mockService.simulatePhotoDownload(filename: "IMG_001.JPG", data: testImageData)
 // photoStore.photos.count == 1

 mockService.simulatePhotoDownload(filename: "IMG_002.JPG", data: testImageData2)
 // photoStore.photos.count == 2
 // photoStore.photos[0].name == "IMG_002.JPG" (newest first)
 ```

 Example 3: SwiftUI Environment Injection (Phase 4)

 ```swift
 // App root
 ContentView()
     .environmentObject(photoStore)

 // Any child view
 struct LiveCaptureView: View {
     @EnvironmentObject var photoStore: PhotoStore

     var body: some View {
         ScrollView {
             ForEach(photoStore.photos) { photo in
                 Image(uiImage: photo.image!)
             }
         }
     }
 }
 ```

 Example 4: Coordinated usage with ConnectionStore

 ```swift
 let service = WiFiCameraService()
 let connectionStore = ConnectionStore(cameraService: service)
 let photoStore = PhotoStore(cameraService: service)

 // Connect
 connectionStore.connect(ip: "192.168.1.1")
 // ... camera takes photo ...
 // photoStore.photos automatically populated

 // Disconnect and clear
 connectionStore.disconnect()
 photoStore.clearPhotos()
 ```
 */
