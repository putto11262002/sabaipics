//  CanonConnectFlowView.swift
//  FrameFast
//
//  Canon connection flow: hotspot check → discovery → select camera.

import SwiftUI

/// Canon connection flow that returns an `ActiveCamera` on success.
///
/// Canon cameras connect to the iPhone's Personal Hotspot, so no WiFi
/// credentials step is needed (unlike Sony). The flow is:
/// 1. Check if hotspot is active → show setup instructions if not
/// 2. Scan the hotspot subnet (172.20.10.2–20) for PTP/IP cameras
/// 3. User selects a camera → hand back ActiveCamera
struct CanonConnectFlowView: View {
    enum StartMode: Equatable {
        case new
        case reconnect(recordID: String)
    }

    private enum Step: Equatable {
        case hotspotCheck
        case discovery(preferredRecordID: String?)
    }

    let startMode: StartMode
    let onConnected: (ActiveCamera) -> Void
    let onCancel: () -> Void

    @State private var step: Step = .hotspotCheck
    @State private var errorMessage: String? = nil

    var body: some View {
        Group {
            switch step {
            case .hotspotCheck:
                CanonHotspotSetupView(
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
                    showsManualIP: true,
                    makeScanTargets: { _ in
                        CanonHotspotDiscovery.candidateIPs()
                    },
                    scanConfig: ScanConfig(timeout: 2.0, maxRetries: 2, retryDelay: 0.5, maxWaves: 3, waveDelay: 0),
                    preflight: {
                        NetworkScannerService.isHotspotActive()
                            ? .ok
                            : .needsNetworkHelp(.notOnLocalNetwork)
                    },
                    onBack: {
                        switch startMode {
                        case .new:
                            step = .hotspotCheck
                        case .reconnect:
                            onCancel()
                        }
                    },
                    onManualIP: {
                        // TODO: Manual IP entry for Canon
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
                if NetworkScannerService.isHotspotActive() {
                    step = .discovery(preferredRecordID: nil)
                } else {
                    step = .hotspotCheck
                }
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
            connectionMode: .personalHotspot
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
