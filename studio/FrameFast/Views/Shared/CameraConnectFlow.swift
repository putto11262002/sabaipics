//  CameraConnectFlow.swift
//  FrameFast
//
//  Unified camera connection flow for all manufacturers.
//
//  New connection:  Setup → Upload Mode → Event Selection → (real-time → Guide → Discovery | offline → Discovery) → Persist
//  Reconnect:       Event Selection → Discovery → Persist

import SwiftUI

// MARK: - Config

struct CameraConnectFlowConfig {
    let manufacturer: CameraManufacturer
    let navigationTitle: String
    let scanConfig: ScanConfig
    let makeScanTargets: (_ preferredIP: String?) -> [String]
    let showsManualIP: Bool
    let connectionMode: APCameraConnectionRecord.ConnectionMode
}

extension CameraConnectFlowConfig {
    static let canon = CameraConnectFlowConfig(
        manufacturer: .canon,
        navigationTitle: "Canon",
        scanConfig: ScanConfig(timeout: 5.0, maxRetries: 2, retryDelay: 0.5, maxWaves: 3, waveDelay: 0),
        makeScanTargets: { preferredIP in CanonAPDiscovery.candidateIPs(preferredIP: preferredIP) },
        showsManualIP: false,
        connectionMode: .cameraHotspot
    )

    static let nikon = CameraConnectFlowConfig(
        manufacturer: .nikon,
        navigationTitle: "Nikon",
        scanConfig: ScanConfig(timeout: 5.0, maxRetries: 2, retryDelay: 0.5, maxWaves: 3, waveDelay: 0),
        makeScanTargets: { preferredIP in NikonHotspotDiscovery.candidateIPs(preferredIP: preferredIP) },
        showsManualIP: false,
        connectionMode: .cameraHotspot
    )

    static let sony = CameraConnectFlowConfig(
        manufacturer: .sony,
        navigationTitle: "Sony",
        scanConfig: ScanConfig(timeout: 5.0, maxRetries: 2, retryDelay: 0.2, maxWaves: 3, waveDelay: 0),
        makeScanTargets: { preferredIP in SonyAPDiscovery.candidateIPs(preferredIP: preferredIP) },
        showsManualIP: false,
        connectionMode: .cameraHotspot
    )
}

// MARK: - Start Mode

enum CameraConnectStartMode: Equatable {
    case new
    case reconnect(recordID: String)
}

// MARK: - Flow

/// Generic camera connection flow parameterised by a manufacturer-specific setup view.
///
/// - `setup` receives `onReady` (call when user taps Next), plus optional `Binding<String?>`
///   for SSID and camera-ID that Sony writes during WiFi join. Canon/Nikon ignore the bindings.
struct CameraConnectFlow<Setup: View>: View {
    private enum Step: Equatable {
        case setup
        case uploadMode
        case eventSelection
        case connectivityGuide
        case discovery(preferredRecordID: String?)
    }

    let startMode: CameraConnectStartMode
    let config: CameraConnectFlowConfig
    let onConnected: (_ camera: ActiveCamera, _ eventId: String, _ eventName: String) -> Void
    let onCancel: () -> Void
    @ViewBuilder let setup: (
        _ onReady: @escaping () -> Void,
        _ ssid: Binding<String?>,
        _ cameraId: Binding<String?>
    ) -> Setup

    @EnvironmentObject private var connectivityStore: ConnectivityStore
    @EnvironmentObject private var coordinator: AppCoordinator

    @State private var step: Step = .setup
    @State private var errorMessage: String? = nil
    @State private var isRealTimeMode: Bool = false

    // Event selection — stored after user picks an event, passed through onConnected.
    @State private var selectedEventId: String? = nil
    @State private var selectedEventName: String? = nil

    // Sony persistence data — Canon/Nikon leave these nil.
    @State private var persistenceSSID: String? = nil
    @State private var persistenceCameraId: String? = nil

    var body: some View {
        Group {
            switch step {
            case .setup:
                setup(
                    { step = .uploadMode },
                    $persistenceSSID,
                    $persistenceCameraId
                )
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

            case .uploadMode:
                UploadModePickerView(
                    onRealTime: {
                        isRealTimeMode = true
                        step = .eventSelection
                    },
                    onOffline: {
                        isRealTimeMode = false
                        step = .eventSelection
                    }
                )
                .navigationTitle("Upload Mode")
                .navigationBarTitleDisplayMode(.large)
                .navigationBarBackButtonHidden(true)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            step = .setup
                        } label: {
                            Image(systemName: "chevron.left")
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.Theme.primary)
                        }
                        .buttonStyle(.plain)
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
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

            case .eventSelection:
                EventSelectionStepView(
                    preselectedEventId: coordinator.selectedEventId,
                    onContinue: { eventId, eventName in
                        selectedEventId = eventId
                        selectedEventName = eventName
                        switch startMode {
                        case .new:
                            if isRealTimeMode {
                                step = .connectivityGuide
                            } else {
                                step = .discovery(preferredRecordID: nil)
                            }
                        case .reconnect(let recordID):
                            step = .discovery(preferredRecordID: recordID)
                        }
                    }
                )
                .navigationTitle("Select Event")
                .navigationBarTitleDisplayMode(.large)
                .navigationBarBackButtonHidden(true)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        if startMode == .new {
                            Button {
                                step = .uploadMode
                            } label: {
                                Image(systemName: "chevron.left")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(Color.Theme.primary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
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

            case .connectivityGuide:
                ConnectivityGuideFlow(
                    isOnline: connectivityStore.isOnline,
                    ipAddress: WiFiNetworkInfo.currentWiFiIPv4()?.ipString ?? "192.168.1.10",
                    subnetMask: WiFiNetworkInfo.currentWiFiIPv4()?.netmaskString ?? "255.255.255.0",
                    onSkip: {
                        step = .discovery(preferredRecordID: nil)
                    },
                    onDone: {
                        step = .discovery(preferredRecordID: nil)
                    }
                )
                .navigationTitle(config.navigationTitle)
                .navigationBarTitleDisplayMode(.inline)
                .navigationBarBackButtonHidden(true)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            step = .eventSelection
                        } label: {
                            Image(systemName: "chevron.left")
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.Theme.primary)
                        }
                        .buttonStyle(.plain)
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
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

            case .discovery(let preferredRecordID):
                let preferredIP: String? = {
                    guard let preferredRecordID else { return nil }
                    let uuid = UUID(uuidString: preferredRecordID)
                    return APCameraConnectionStore.shared
                        .listRecords(manufacturer: config.manufacturer)
                        .first(where: { $0.id == uuid })?
                        .lastKnownCameraIP
                }()

                CameraDiscoveryView(
                    preferredIP: preferredIP,
                    showsManualIP: config.showsManualIP,
                    makeScanTargets: config.makeScanTargets,
                    scanConfig: config.scanConfig,
                    onBack: {
                        switch startMode {
                        case .new:
                            step = .eventSelection
                        case .reconnect:
                            onCancel()
                        }
                    },
                    onManualIP: {
                        // Manual IP not implemented for any manufacturer yet.
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
            persistenceSSID = nil
            persistenceCameraId = nil
            selectedEventId = nil
            selectedEventName = nil
            switch startMode {
            case .new:
                step = .setup
            case .reconnect:
                step = .eventSelection
            }
        }
    }

    // MARK: - Persist + hand back

    private func acceptSelection(camera: DiscoveredCamera, allCameras: [DiscoveredCamera]) async {
        guard let session = camera.extractSession() else {
            await MainActor.run { errorMessage = "No camera session found." }
            return
        }

        guard session.connected else {
            await MainActor.run { errorMessage = "Camera session is not connected yet." }
            return
        }

        guard let eventId = selectedEventId, let eventName = selectedEventName else {
            await MainActor.run { errorMessage = "No event selected." }
            return
        }

        let activeCamera = ActiveCamera(
            name: camera.name,
            ipAddress: camera.ipAddress,
            session: session
        )

        for other in allCameras where other.ipAddress != camera.ipAddress {
            await other.disconnect()
        }

        APCameraConnectionStore.shared.saveCurrentNetwork(
            manufacturer: config.manufacturer,
            ip: activeCamera.ipAddress,
            cameraName: activeCamera.name,
            ssid: persistenceSSID,
            cameraId: persistenceCameraId,
            connectionMode: config.connectionMode
        )

        await MainActor.run {
            onConnected(activeCamera, eventId, eventName)
        }
    }
}

#if DEBUG

#Preview("Camera Connect Flow — Canon") {
    NavigationStack {
        CameraConnectFlow(
            startMode: .new,
            config: .canon,
            onConnected: { _, _, _ in },
            onCancel: {}
        ) { onReady, _, _ in
            CanonAPSetupView(onNext: onReady)
        }
    }
}

#endif
