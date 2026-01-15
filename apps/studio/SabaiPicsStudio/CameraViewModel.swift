//
//  CameraViewModel.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//

import Foundation
import ImageCaptureCore
import Combine
import SwiftUI

/// Represents a captured photo
struct CapturedPhoto: Identifiable {
    let id = UUID()
    let name: String
    let data: Data
    let image: UIImage?
    let captureDate: Date
    var isDownloading: Bool = false

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

/// App states matching the user journey flow
enum AppState {
    case searching
    case cameraFound(ICCameraDevice)
    case connecting
    case ready
    case capturing
    case error(String)
}

/// Connection mode for camera
enum ConnectionMode {
    case usb
    case wifi
}

/// ViewModel managing camera discovery and connection state
class CameraViewModel: NSObject, ObservableObject {
    // MARK: - Published Properties
    @Published var appState: AppState = .searching
    @Published var isSearching: Bool = false
    @Published var capturedPhotos: [CapturedPhoto] = []
    @Published var photoCount: Int = 0
    @Published var detectedPhotoCount: Int = 0 // Phase 3: Photo detection counter
    @Published var connectionMode: ConnectionMode = .wifi // Default to WiFi

    // MARK: - Private Properties
    private let cameraService: CameraService // USB (legacy)
    private let wifiService: WiFiCameraService // WiFi (new)
    private var cancellables = Set<AnyCancellable>()
    private var wifiCancellables = Set<AnyCancellable>()
    private var connectedCamera: ICCameraDevice?
    private var sessionStartTime: Date?
    private var initialCatalogReceived = false

    // MARK: - Initialization
    override init() {
        self.cameraService = CameraService() // USB (legacy, disabled)
        self.wifiService = WiFiCameraService() // WiFi (new)
        super.init()

        // USB DISABLED - uncomment to re-enable
        // setupBindings()
        // startSearching()

        // WiFi ACTIVE
        setupWiFiBindings()
    }

    // MARK: - Setup
    private func setupBindings() {
        // USB (legacy) - Listen to camera discoveries
        cameraService.$discoveredCameras
            .sink { [weak self] cameras in
                guard let self = self else { return }

                if let firstCamera = cameras.first {
                    // Camera found!
                    self.appState = .cameraFound(firstCamera)
                } else if self.isSearching {
                    // Still searching
                    self.appState = .searching
                }
            }
            .store(in: &cancellables)

        // Listen to search state
        cameraService.$isSearching
            .assign(to: &$isSearching)
    }

    /// Setup WiFi bindings for reactive state management
    private func setupWiFiBindings() {
        print("📱 [CameraViewModel] Setting up WiFi bindings")

        // Listen to WiFi connection state
        wifiService.$isConnected
            .sink { [weak self] connected in
                guard let self = self else { return }

                if connected {
                    print("✅ [CameraViewModel] WiFi camera connected - transitioning to capture")
                    self.appState = .capturing
                }
            }
            .store(in: &wifiCancellables)

        // Listen to WiFi connection errors
        wifiService.$connectionError
            .compactMap { $0 }
            .sink { [weak self] error in
                print("❌ [CameraViewModel] WiFi connection error: \(error)")
                self?.appState = .error(error)
            }
            .store(in: &wifiCancellables)

        // Listen to detected photos (Phase 3) - just for counter
        wifiService.$detectedPhotos
            .sink { [weak self] photos in
                self?.detectedPhotoCount = photos.count
            }
            .store(in: &wifiCancellables)

        // Listen to downloaded photos (Phase 4) - sequential downloads from monitoring thread
        wifiService.$downloadedPhotos
            .sink { [weak self] downloads in
                guard let self = self else { return }

                for (filename, data) in downloads {
                    // Check if already added
                    let alreadyAdded = self.capturedPhotos.contains { $0.name == filename }
                    guard !alreadyAdded else { continue }

                    // Create UIImage from data
                    if let image = UIImage(data: data) {
                        let photo = CapturedPhoto(name: filename, image: image)
                        self.capturedPhotos.append(photo)
                        self.photoCount = self.capturedPhotos.count
                        print("✅ [CameraViewModel] Added photo to grid: \(filename)")
                    } else {
                        print("❌ [CameraViewModel] Failed to create image from data: \(filename)")
                    }
                }
            }
            .store(in: &wifiCancellables)
    }

    // MARK: - Public Methods

    // MARK: USB Methods (Legacy)
    func startSearching() {
        print("📱 Starting camera search from ViewModel")
        appState = .searching
        cameraService.startSearching()
    }

    func stopSearching() {
        print("📱 Stopping camera search from ViewModel")
        cameraService.stopSearching()
    }

    // MARK: WiFi Methods (Active)

    /// Connect to WiFi camera with specified IP
    /// - Parameter ip: Camera IP address (e.g. "192.168.1.1")
    func connectToWiFiCamera(ip: String) {
        print("📱 [CameraViewModel] Connecting to WiFi camera at \(ip)")
        appState = .connecting
        connectionMode = .wifi

        let config = WiFiCameraService.CameraConfig(
            ip: ip,
            model: "Canon EOS (WLAN)",
            proto: "ptpip"
        )

        wifiService.connect(config: config)
    }

    /// Disconnect from WiFi camera
    func disconnectWiFi() {
        print("📱 [CameraViewModel] Disconnecting WiFi camera")
        wifiService.disconnect()
        appState = .searching
    }

    func takePicture() {
        guard let camera = connectedCamera else {
            print("❌ No camera connected")
            return
        }

        print("📸 Attempting to trigger remote capture from iPad...")

        // Check if camera supports remote capture
        #if os(macOS)
        camera.requestTakePicture()
        #else
        // iOS doesn't support requestTakePicture() 😕
        // Try using PTP commands if camera supports it
        print("⚠️ Remote capture not available on iOS via ImageCaptureCore")
        print("💡 Suggestion: Use camera's physical shutter or switch to WiFi mode")
        #endif
    }

    func connectToCamera(_ camera: ICCameraDevice) {
        print("📱 Connecting to camera: \(camera.name ?? "Unknown")")
        appState = .connecting
        connectedCamera = camera
        sessionStartTime = Date()
        initialCatalogReceived = false

        // Set this ViewModel as the camera delegate
        camera.delegate = self

        // Open session with camera (this enables tethered mode)
        camera.requestOpenSession { error in
            DispatchQueue.main.async { [weak self] in
                if let error = error {
                    print("❌ Failed to connect: \(error.localizedDescription)")
                    self?.appState = .error("Failed to connect: \(error.localizedDescription)")
                } else {
                    print("✅ Connected to camera successfully")
                    print("📸 Waiting for initial catalog to load...")
                    print("📸 Once ready, press shutter to take photos!")
                    self?.appState = .capturing
                }
            }
        }
    }
}

// MARK: - ICDeviceDelegate
extension CameraViewModel: ICDeviceDelegate {
    func didRemove(_ device: ICDevice) {
        print("📷 Camera disconnected")
        DispatchQueue.main.async { [weak self] in
            self?.appState = .error("Camera disconnected")
        }
    }

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        if let error = error {
            print("❌ Failed to open session: \(error.localizedDescription)")
        } else {
            print("✅ Session opened successfully")
        }
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        if let error = error {
            print("❌ Session close error: \(error.localizedDescription)")
        } else {
            print("✅ Session closed")
        }
    }
}

// MARK: - ICCameraDeviceDelegate
extension CameraViewModel: ICCameraDeviceDelegate {
    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        // IGNORE all items until initial catalog is loaded
        guard initialCatalogReceived else {
            print("📸 Initial catalog loading... ignoring \(items.count) existing items")
            return
        }

        // NOW we only get items that are added AFTER session started (NEW photos!)
        print("📸 NEW photo(s) detected: \(items.count)")

        for item in items {
            // Only process files (photos), not folders
            guard let file = item as? ICCameraFile else { continue }

            print("📸 Downloading new photo: \(file.name ?? "unknown")")

            // Create a temporary directory for downloads
            let tempDir = FileManager.default.temporaryDirectory

            // Request to download the file
            camera.requestDownloadFile(
                file,
                options: [.downloadsDirectoryURL: tempDir],
                downloadDelegate: self,
                didDownloadSelector: #selector(didDownloadFile(_:error:options:contextInfo:)),
                contextInfo: nil
            )
        }
    }

    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {
        print("📸 Items removed: \(items.count)")
    }

    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {
        print("📸 Items renamed: \(items.count)")
    }

    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {
        print("📸 Camera capability changed")
    }

    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {
        // Optional: Handle thumbnails if needed
    }

    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable : Any]?, for item: ICCameraItem, error: Error?) {
        // Optional: Handle metadata if needed
    }

    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {
        print("📸 PTP event received")
    }

    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        print("✅ Device ready with complete content catalog")
        print("📸 Initial catalog loaded - now monitoring for NEW photos only")
        print("🎯 Ready to shoot! Press camera shutter button!")

        DispatchQueue.main.async { [weak self] in
            self?.initialCatalogReceived = true
        }
    }

    func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {
        print("📸 Access restriction removed")
    }

    func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {
        print("📸 Access restriction enabled")
    }
}

// MARK: - ICCameraDeviceDownloadDelegate
extension CameraViewModel: ICCameraDeviceDownloadDelegate {
    @objc func didDownloadFile(_ file: ICCameraFile, error: Error?, options: [String : Any] = [:], contextInfo: UnsafeMutableRawPointer?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if let error = error {
                print("❌ Download failed: \(error.localizedDescription)")
                return
            }

            // Get the download directory from options
            guard let downloadDir = options[ICDownloadOption.downloadsDirectoryURL.rawValue] as? URL else {
                print("❌ No download directory")
                return
            }

            let fileURL = downloadDir.appendingPathComponent(file.name ?? "photo.jpg")

            // Read the downloaded file
            guard let data = try? Data(contentsOf: fileURL) else {
                print("❌ Failed to read downloaded file")
                return
            }

            print("✅ Photo downloaded: \(file.name ?? "unknown"), size: \(data.count) bytes")

            // Create captured photo object
            let photo = CapturedPhoto(name: file.name ?? "Photo", data: data)
            self.capturedPhotos.insert(photo, at: 0) // Insert at beginning (newest first)
            self.photoCount = self.capturedPhotos.count

            print("📊 Total photos: \(self.photoCount)")

            // Clean up temp file
            try? FileManager.default.removeItem(at: fileURL)
        }
    }
}
