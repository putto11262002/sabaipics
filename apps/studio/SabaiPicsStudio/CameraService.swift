//
//  CameraService.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//

import Foundation
import ImageCaptureCore

/// Service for detecting and managing camera connections (USB and WiFi)
class CameraService: NSObject, ObservableObject {

    // MARK: - Published Properties
    @Published var discoveredCameras: [ICCameraDevice] = []
    @Published var isSearching: Bool = false

    // MARK: - Private Properties
    private var deviceBrowser: ICDeviceBrowser?

    // MARK: - Initialization
    override init() {
        super.init()
        setupDeviceBrowser()
    }

    // MARK: - Setup
    private func setupDeviceBrowser() {
        deviceBrowser = ICDeviceBrowser()
        deviceBrowser?.delegate = self
        deviceBrowser?.browsedDeviceTypeMask = .camera
    }

    // MARK: - Public Methods
    func startSearching() {
        print("🔍 Starting camera search...")
        isSearching = true
        deviceBrowser?.start()
    }

    func stopSearching() {
        print("🛑 Stopping camera search...")
        isSearching = false
        deviceBrowser?.stop()
    }
}

// MARK: - ICDeviceBrowserDelegate
extension CameraService: ICDeviceBrowserDelegate {

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }

        print("📷 Camera found: \(camera.name ?? "Unknown")")

        DispatchQueue.main.async {
            self.discoveredCameras.append(camera)
        }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        guard let camera = device as? ICCameraDevice else { return }

        print("📷 Camera removed: \(camera.name ?? "Unknown")")

        DispatchQueue.main.async {
            self.discoveredCameras.removeAll { $0 == camera }
        }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didEncounterError error: Error) {
        print("❌ Camera browser error: \(error.localizedDescription)")
    }
}
