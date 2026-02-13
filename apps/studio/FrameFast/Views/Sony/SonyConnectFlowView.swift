//  SonyConnectFlowView.swift
//  FrameFast

import SwiftUI

/// Sony-only connection flow that returns an `ActiveCamera` on success.
///
/// Owns local step state and reuses existing Sony screens + unified discovery UI.
struct SonyConnectFlowView: View {
    enum StartMode: Equatable {
        case new
        case reconnect(recordID: String)
    }

    private enum Step: Equatable {
        case decision
        case credentialsQR
        case credentialsManual
        case joiningWiFi(credentials: WiFiCredentials, cameraId: String?)
        case discovery(preferredRecordID: String?, backTarget: DiscoveryBackTarget)
    }

    private enum DiscoveryBackTarget: Equatable {
        case decision
        case cancel
    }

    let startMode: StartMode
    let onConnected: (ActiveCamera) -> Void
    let onCancel: () -> Void

    @State private var step: Step = .decision
    @State private var errorMessage: String? = nil
    @State private var joinedWiFi: SonyWiFiJoinViewModel.JoinInfo? = nil
    @State private var reconnectSavedSSID: String? = nil
    @State private var reconnectSavedCameraId: String? = nil

    var body: some View {
        Group {
            switch step {
            case .decision:
                SonyAPNewCameraDecisionView(
                    isWiFiConnected: WiFiNetworkInfo.currentWiFiIPv4() != nil,
                    showsManualIPOption: false,
                    onScanQR: {
                        step = .credentialsQR
                    },
                    onAlreadyOnWiFi: {
                        step = .discovery(preferredRecordID: nil, backTarget: .decision)
                    },
                    onEnterSSID: {
                        step = .credentialsManual
                    }
                )
                .navigationTitle("Sony")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            onCancel()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color.Theme.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }

            case .credentialsQR:
                SonyQRCredentialsView(
                    onBack: { step = .decision },
                    onSuccess: { credentials, cameraId in
                        step = .joiningWiFi(credentials: credentials, cameraId: cameraId)
                    }
                )

            case .credentialsManual:
                SonyManualCredentialsView(
                    onBack: { step = .decision },
                    onSuccess: { credentials in
                        step = .joiningWiFi(credentials: credentials, cameraId: nil)
                    }
                )

            case .joiningWiFi(let credentials, let cameraId):
                WiFiJoinView(
                    credentials: credentials,
                    onContinue: { credentials in
                        joinedWiFi = SonyWiFiJoinViewModel.JoinInfo(credentials: credentials, cameraId: cameraId)
                        step = .discovery(preferredRecordID: nil, backTarget: .decision)
                    },
                    onCancel: {
                        step = .decision
                    }
                )

            case .discovery(let preferredRecordID, let backTarget):
                let preferredIP: String? = {
                    guard let preferredRecordID else { return nil }
                    let uuid = UUID(uuidString: preferredRecordID)
                    return APCameraConnectionStore.shared.listRecords(manufacturer: .sony).first(where: { $0.id == uuid })?.lastKnownCameraIP
                }()

                CameraDiscoveryScreen(
                    preferredIP: preferredIP,
                    showsManualIP: false,
                    makeScanTargets: { preferredIP in
                        SonyAPDiscovery.candidateIPs(preferredIP: preferredIP)
                    },
                    scanConfig: ScanConfig(timeout: 5.0, maxRetries: 2, retryDelay: 0.2, maxWaves: 3, waveDelay: 0),
                    onBack: {
                        switch backTarget {
                        case .decision:
                            step = .decision
                        case .cancel:
                            onCancel()
                        }
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
        .alert("Connection failed", isPresented: Binding(get: { errorMessage != nil }, set: { _ in errorMessage = nil })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .onAppear {
            joinedWiFi = nil
            errorMessage = nil
            reconnectSavedSSID = nil
            reconnectSavedCameraId = nil
            switch startMode {
            case .new:
                step = .decision
            case .reconnect(let recordID):
                // The reconnect confirmation prompt is shown before navigation (in Capture tab).
                step = .discovery(preferredRecordID: recordID, backTarget: .cancel)
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

        // Persist Sony "Saved" record (AP mode) with the credentials we used (if known).
        APCameraConnectionStore.shared.saveCurrentNetwork(
            manufacturer: .sony,
            ip: activeCamera.ipAddress,
            cameraName: activeCamera.name,
            ssid: joinedWiFi?.credentials.ssid ?? reconnectSavedSSID,
            cameraId: joinedWiFi?.cameraId ?? reconnectSavedCameraId,
            connectionMode: .cameraHotspot
        )

        await MainActor.run {
            onConnected(activeCamera)
        }
    }

}

#if DEBUG

#Preview("Sony Connect Flow") {
    NavigationStack {
        SonyConnectFlowView(
            startMode: .new,
            onConnected: { _ in },
            onCancel: {}
        )
    }
}

#endif
