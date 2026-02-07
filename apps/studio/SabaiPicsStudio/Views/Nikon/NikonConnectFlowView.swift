//  NikonConnectFlowView.swift
//  SabaiPicsStudio
//
//  Nikon connection flow: discovery → select camera.
//

import SwiftUI

/// Nikon connection flow that returns an `ActiveCamera` on success.
///
/// Nikon cameras typically expose PTP/IP on their own WiFi/hotspot network.
/// This flow assumes the user is already connected to the camera WiFi.
struct NikonConnectFlowView: View {
    enum StartMode: Equatable {
        case new
        case reconnect(recordID: String)
    }

    private enum Step: Equatable {
        case discovery(preferredRecordID: String?)
    }

    let startMode: StartMode
    let onConnected: (ActiveCamera) -> Void
    let onCancel: () -> Void

    @State private var step: Step = .discovery(preferredRecordID: nil)
    @State private var errorMessage: String? = nil

    var body: some View {
        Group {
            switch step {
            case .discovery(let preferredRecordID):
                let preferredIP: String? = {
                    guard let preferredRecordID else { return nil }
                    let uuid = UUID(uuidString: preferredRecordID)
                    return APCameraConnectionStore.shared
                        .listRecords(manufacturer: .nikon)
                        .first(where: { $0.id == uuid })?
                        .lastKnownCameraIP
                }()

                CameraDiscoveryScreen(
                    preferredIP: preferredIP,
                    showsManualIP: false,
                    makeScanTargets: { preferredIP in
                        NikonHotspotDiscovery.candidateIPs(preferredIP: preferredIP)
                    },
                    scanConfig: ScanConfig(timeout: 2.0, maxRetries: 2, retryDelay: 0.5, maxWaves: 3, waveDelay: 0),
                    onBack: {
                        onCancel()
                    },
                    onManualIP: {
                        // Manual IP hidden.
                    },
                    onSelect: { camera, allCameras in
                        Task {
                            await acceptSelection(camera: camera, allCameras: allCameras)
                        }
                    },
                    onDone: {
                        onCancel()
                    }
                )
            }
        }
        .alert(
            "Connection failed",
            isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })
        ) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .onAppear {
            errorMessage = nil
            switch startMode {
            case .new:
                step = .discovery(preferredRecordID: nil)
            case .reconnect(let recordID):
                step = .discovery(preferredRecordID: recordID)
            }
        }
    }

    private func acceptSelection(camera: DiscoveredCamera, allCameras: [DiscoveredCamera]) async {
        guard let session = camera.extractSession() else {
            await MainActor.run {
                errorMessage = "No camera session found."
            }
            return
        }

        guard session.connected else {
            await MainActor.run {
                errorMessage = "Camera session is not connected yet."
            }
            return
        }

        let activeCamera = ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )

        // Disconnect other discovered cameras.
        for other in allCameras where other.ipAddress != camera.ipAddress {
            await other.disconnect()
        }

        // Persist Nikon connection record.
        APCameraConnectionStore.shared.saveCurrentNetwork(
            manufacturer: .nikon,
            ip: activeCamera.ipAddress,
            cameraName: activeCamera.name,
            ssid: nil,
            cameraId: nil,
            connectionMode: .cameraHotspot
        )

        await MainActor.run {
            onConnected(activeCamera)
        }
    }
}

#if DEBUG

#Preview("Nikon Connect Flow") {
    NavigationStack {
        NikonConnectFlowView(
            startMode: .new,
            onConnected: { _ in },
            onCancel: {}
        )
    }
}

#endif
