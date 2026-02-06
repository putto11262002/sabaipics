//  CaptureConnectFlowView.swift
//  SabaiPicsStudio

import SwiftUI

/// In-tab container for the existing capture connection flow (Sony-first).
///
/// This is intentionally state-machine-driven to reuse existing screens that already
/// depend on `CaptureFlowCoordinator`.
struct CaptureConnectFlowView: View {
    @EnvironmentObject private var captureFlow: CaptureFlowCoordinator

    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            switch captureFlow.state {
            case .manufacturerSelection:
                ManufacturerSelectionView(onSelectManufacturer: { manufacturer in
                    captureFlow.selectManufacturer(manufacturer)
                })
                    .captureDoneButton { exitFlow() }

            case .sonyEntry:
                SonyAPEntryView(
                    onBack: { captureFlow.backToManufacturerSelection() },
                    onNewCamera: { captureFlow.startSonyNewCamera() },
                    onConnectRecord: { id in captureFlow.connectToSonyRecord(id: id) }
                )
                    .captureDoneButton { exitFlow() }

            case .sonyNewCameraDecision:
                SonyAPNewCameraDecisionView(
                    isWiFiConnected: false,
                    onScanQR: { captureFlow.startSonySetup() },
                    onAlreadyOnWiFi: { captureFlow.proceedToDiscovery() },
                    onEnterSSID: { captureFlow.startSonySSIDStub() },
                    onManualIP: { captureFlow.skipToManualEntry() }
                )
                .captureDoneButton { exitFlow() }

            case let .sonyWiFiOnboarding(mode):
                SonyWiFiOnboardingView(
                    mode: mode == .qr ? .qr : .manual,
                    onBack: { captureFlow.state = .sonyNewCameraDecision },
                    onContinue: { _ in captureFlow.proceedToDiscovery() }
                )
                .captureDoneButton { exitFlow() }

            case .hotspotSetup:
                HotspotSetupView()
                    .captureDoneButton { exitFlow() }

            case .discovering:
                if captureFlow.selectedManufacturer == .sony {
                    let preferredIP: String? = {
                        guard let id = captureFlow.preferredSonyRecordID else { return nil }
                        let uuid = UUID(uuidString: id)
                        return APCameraConnectionStore.shared.listRecords(manufacturer: .sony).first(where: { $0.id == uuid })?.lastKnownCameraIP
                    }()

                    UnifiedCameraDiscoveryView(
                        preferredIP: preferredIP,
                        makeScanTargets: { preferredIP in
                            SonyAPDiscovery.candidateIPs(preferredIP: preferredIP)
                        },
                        scanConfig: ScanConfig(timeout: 1.0, maxRetries: 2, retryDelay: 0.2, maxWaves: 3, waveDelay: 0),
                        onBack: {
                            captureFlow.backToManufacturerSelection()
                        },
                        onManualIP: {
                            captureFlow.skipToManualEntry()
                        },
                        onSelect: { camera, allCameras in
                            captureFlow.updateDiscoveredCameras(allCameras)
                            captureFlow.selectDiscoveredCamera(camera)
                        },
                        onDone: {
                            exitFlow()
                        }
                    )
                } else {
                    CameraDiscoveryView()
                        .captureDoneButton { exitFlow() }
                }

            case .manualIPEntry:
                ManualIPEntryView()
                    .captureDoneButton { exitFlow() }

            case .connecting(let ip):
                ConnectingView(ipAddress: ip, onDone: {
                    exitFlow()
                })

            case .transferring:
                // In the Capture tab flow we should never show the legacy transfer UI.
                // If we do land here, treat it as a completion state and return to home.
                Color.clear
                    .onAppear {
                        onClose()
                    }

            case .error(let message):
                ConnectionErrorView(errorMessage: message, onTryAgain: { captureFlow.backToManufacturerSelection() })
                    .captureDoneButton { exitFlow() }
            }
        }
    }

    private func exitFlow() {
        captureFlow.backToManufacturerSelection()
        onClose()
    }
}

private struct CaptureDoneButtonModifier: ViewModifier {
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        action()
                    } label: {
                        Text("Done")
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
                    .buttonStyle(.plain)
                }
            }
    }
}

private extension View {
    func captureDoneButton(_ action: @escaping () -> Void) -> some View {
        modifier(CaptureDoneButtonModifier(action: action))
    }
}

#if DEBUG

#Preview("Capture Connect Flow") {
    let coordinator = CaptureFlowCoordinator()
    return NavigationStack {
        CaptureConnectFlowView(onClose: {})
            .environmentObject(coordinator)
    }
}

#endif
