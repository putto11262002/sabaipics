//  CameraConnectCoordinator.swift
//  SabaiPicsStudio

import Foundation

/// Connection/handoff coordinator for building an `ActiveCamera` from discovery.
///
/// Navigation is owned by native `NavigationStack`.
@MainActor
final class CameraConnectCoordinator: ObservableObject {
    @Published var manufacturer: CameraManufacturer? = nil

    /// Brand-specific record id used for reconnect hints (e.g. Sony saved record id).
    @Published var preferredRecordID: String? = nil

    @Published private(set) var discoveredCameras: [DiscoveredCamera] = []

    var onConnected: ((ActiveCamera) -> Void)?

    func reset() {
        manufacturer = nil
        preferredRecordID = nil
        discoveredCameras = []
    }

    func setManufacturer(_ manufacturer: CameraManufacturer) {
        self.manufacturer = manufacturer
    }

    func setPreferredRecordID(_ id: String?) {
        preferredRecordID = id
    }

    func updateDiscoveredCameras(_ cameras: [DiscoveredCamera]) {
        discoveredCameras = cameras
    }

    func preferredIPHint() -> String? {
        guard manufacturer == .sony, let id = preferredRecordID else { return nil }
        let uuid = UUID(uuidString: id)
        return APCameraConnectionStore.shared.listRecords(manufacturer: .sony).first(where: { $0.id == uuid })?.lastKnownCameraIP
    }

    func acceptSelection(_ camera: DiscoveredCamera) {
        guard let session = camera.extractSession() else {
            print("[CameraConnectCoordinator] ❌ No session in camera object")
            return
        }

        guard session.connected else {
            print("[CameraConnectCoordinator] ❌ Session exists but not connected")
            return
        }

        let activeCamera = ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )

        // Disconnect OTHER discovered cameras (not the selected one)
        let otherCameras = discoveredCameras.filter { $0.ipAddress != camera.ipAddress }
        if !otherCameras.isEmpty {
            Task {
                for other in otherCameras {
                    await other.disconnect()
                }
            }
        }
        discoveredCameras = []

        // Persist Sony "Saved" info.
        if manufacturer == .sony {
            APCameraConnectionStore.shared.saveCurrentNetwork(manufacturer: .sony, ip: activeCamera.ipAddress, cameraName: activeCamera.name)
        }

        onConnected?(activeCamera)
    }
}
