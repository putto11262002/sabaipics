//  CanonConnectFlowView.swift
//  FrameFast
//
//  Canon connection flow: AP setup → discovery → select camera.

import SwiftUI

/// Canon connection flow that returns an `ActiveCamera` on success.
///
/// Canon cameras use their own AP hotspot, so the flow is:
/// 1. Show setup instructions to connect to camera's AP
/// 2. Scan the camera AP subnet for PTP/IP cameras
/// 3. User selects a camera → hand back ActiveCamera
struct CanonConnectFlowView: View {
    enum StartMode: Equatable {
        case new
        case reconnect(recordID: String)
    }

    private enum Step: Equatable {
        case apSetup
        case discovery(preferredRecordID: String?)
    }

    let startMode: StartMode
    let onConnected: (ActiveCamera) -> Void
    let onCancel: () -> Void

    @State private var step: Step = .apSetup
    @State private var errorMessage: String? = nil

    var body: some View {
        Group {
            switch step {
            case .apSetup:
                CanonAPSetupView(
                    onNext: {
                        step = .discovery(preferredRecordID: nil)
                    }
                )
                .navigationTitle("Canon")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            onCancel()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color.Theme.mutedForeground)
                        }
                        .buttonStyle(.plain)
                    }
                }

            case .discovery(let preferredRecordID):
                let preferredIP: String? = {
                    guard let preferredRecordID else { return nil }
                    let uuid = UUID(uuidString: preferredRecordID)
                    return APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
                        .first(where: { $0.id == uuid })?.lastKnownCameraIP
                }()

                CameraDiscoveryScreen(
                    preferredIP: preferredIP,
                    showsManualIP: false,
                    makeScanTargets: { preferredIP in
                        CanonAPDiscovery.candidateIPs(preferredIP: preferredIP)
                    },
                    scanConfig: ScanConfig(timeout: 5.0, maxRetries: 2, retryDelay: 0.5, maxWaves: 3, waveDelay: 0),
                    onBack: {
                        switch startMode {
                        case .new:
                            step = .apSetup
                        case .reconnect:
                            onCancel()
                        }
                    },
                    onManualIP: {
                        // Intentionally disabled: Canon manual IP connect is not implemented yet.
                        // Keeping this hidden avoids reviewer-visible dead ends (App Completeness).
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
        .alert("Connection failed", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .onAppear {
            errorMessage = nil
            switch startMode {
            case .new:
                step = .apSetup
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

        // Persist Canon connection record.
        APCameraConnectionStore.shared.saveCurrentNetwork(
            manufacturer: .canon,
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

#Preview("Canon Connect Flow") {
    NavigationStack {
        CanonConnectFlowView(
            startMode: .new,
            onConnected: { _ in },
            onCancel: {}
        )
    }
}

#endif
