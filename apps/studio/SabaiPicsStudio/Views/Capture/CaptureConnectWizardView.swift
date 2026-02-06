//  SabaiPicsStudio
//
//  Capture tab connect wizard.
//  Owns navigation + connect coordinator and only emits an ActiveCamera on success.

import SwiftUI

struct CaptureConnectWizardView: View {
    @StateObject private var connect = CameraConnectCoordinator()
    @State private var path: [CaptureConnectRoute] = []

    let onConnected: (ActiveCamera) -> Void

    init(
        onConnected: @escaping (ActiveCamera) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.onConnected = onConnected
        self.onCancel = onCancel
    }

    private let onCancel: (() -> Void)?

    var body: some View {
        NavigationStack(path: $path) {
            CaptureHomeView(
                onConnectNew: { _ in
                    connect.reset()
                    path = [.manufacturerSelection]
                },
                recentSony: [],
                onReconnect: { manufacturer, id in
                    connect.reset()
                    guard manufacturer.lowercased() == "sony" else {
                        path = [.manufacturerSelection]
                        return
                    }
                    connect.setManufacturer(.sony)
                    connect.setPreferredRecordID(id)
                    path = [.sonyDiscovery]
                }
            )
            .toolbar {
                if !path.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        doneButton
                    }
                }
            }
            .navigationDestination(for: CaptureConnectRoute.self) { route in
                destination(route)
            }
            .onAppear {
                connect.onConnected = { activeCamera in
                    onConnected(activeCamera)
                    connect.reset()
                    path = []
                }
            }
        }
    }

    private var doneButton: some View {
        Button("Done") {
            connect.reset()
            path = []
            onCancel?()
        }
        .buttonStyle(.plain)
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.Theme.muted)
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(Color.Theme.border, lineWidth: 1)
        )
        .foregroundStyle(Color.Theme.foreground)
    }

    @ViewBuilder
    private func destination(_ route: CaptureConnectRoute) -> some View {
        switch route {
        case .manufacturerSelection:
            ManufacturerSelectionView(onSelectManufacturer: { manufacturer in
                connect.setManufacturer(manufacturer)
                if manufacturer == .sony {
                    path.append(.sonyEntry)
                } else {
                    path.append(.error(message: "\(manufacturer.rawValue) is not supported yet."))
                }
            })
            .navigationTitle("Connect")
            .navigationBarTitleDisplayMode(.inline)

        case .sonyEntry:
            SonyAPEntryView(
                onBack: {
                    _ = path.popLast()
                },
                onNewCamera: {
                    path.append(.sonyNewCameraDecision)
                },
                onConnectRecord: { id in
                    connect.setManufacturer(.sony)
                    connect.setPreferredRecordID(id)
                    path.append(.sonyDiscovery)
                }
            )

        case .sonyNewCameraDecision:
            SonyAPNewCameraDecisionView(
                isWiFiConnected: false,
                showsManualIPOption: false,
                onScanQR: {
                    connect.setPreferredRecordID(nil)
                    path.append(.sonyWiFiOnboardingQR)
                },
                onAlreadyOnWiFi: {
                    connect.setPreferredRecordID(nil)
                    path.append(.sonyDiscovery)
                },
                onEnterSSID: {
                    connect.setPreferredRecordID(nil)
                    path.append(.sonyWiFiOnboardingManual)
                }
            )

        case .sonyWiFiOnboardingQR:
            SonyWiFiOnboardingView(
                mode: .qr,
                onBack: { _ = path.popLast() },
                onContinue: { _ in path.append(.sonyDiscovery) }
            )

        case .sonyWiFiOnboardingManual:
            SonyWiFiOnboardingView(
                mode: .manual,
                onBack: { _ = path.popLast() },
                onContinue: { _ in path.append(.sonyDiscovery) }
            )

        case .sonyDiscovery:
            let preferredIP = connect.preferredIPHint()
            UnifiedCameraDiscoveryView(
                preferredIP: preferredIP,
                showsManualIP: false,
                makeScanTargets: { preferredIP in
                    SonyAPDiscovery.candidateIPs(preferredIP: preferredIP)
                },
                scanConfig: ScanConfig(timeout: 1.0, maxRetries: 2, retryDelay: 0.2, maxWaves: 3, waveDelay: 0),
                onBack: {
                    _ = path.popLast()
                },
                onManualIP: {
                    // Manual IP hidden.
                },
                onSelect: { camera, allCameras in
                    connect.updateDiscoveredCameras(allCameras)
                    connect.acceptSelection(camera)
                },
                onDone: {
                    connect.reset()
                    path = []
                    onCancel?()
                }
            )

        case .error(let message):
            ConnectionErrorView(
                errorMessage: message,
                onTryAgain: {
                    connect.reset()
                    path = []
                }
            )
        }
    }
}

#if DEBUG

#Preview("Capture Connect Wizard") {
    CaptureConnectWizardView(
        onConnected: { _ in },
        onCancel: {}
    )
}

#endif
