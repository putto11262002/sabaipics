//
//  ContentView.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//  Updated: 2026-01-19 - Transfer Session Architecture
//

import SwiftUI

/// LEGACY: The old capture wizard container.
///
/// Kept temporarily for reference while the Capture tab flow is migrating.
/// New entry point is `MainTabView` -> `CaptureTabRootView`.
@available(
    *, deprecated,
    message: "Legacy capture wizard container. Use Capture tab (CaptureTabRootView) instead."
)
struct ContentView: View {
    @EnvironmentObject var coordinator: AppCoordinator
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // NEW

    var body: some View {
        ZStack {
            // Background color
            Color(Color.Theme.background)
                .ignoresSafeArea()

            // Content based on capture flow state (CHANGED)
            switch captureFlow.state {
            case .manufacturerSelection:
                ManufacturerSelectionView(onSelectManufacturer: { manufacturer in
                    captureFlow.selectManufacturer(manufacturer)
                })
                    .transition(.opacity)
                    .id("manufacturer-selection")

            case .sonyEntry:
                SonyAPEntryView(
                    onBack: { captureFlow.backToManufacturerSelection() },
                    onNewCamera: { captureFlow.startSonyNewCamera() },
                    onConnectRecord: { id in captureFlow.connectToSonyRecord(id: id) }
                )
                    .transition(.opacity)
                    .id("sony-entry")

            case .sonyNewCameraDecision:
                SonyAPNewCameraDecisionView(
                    isWiFiConnected: false,
                    onScanQR: { captureFlow.startSonySetup() },
                    onAlreadyOnWiFi: { captureFlow.proceedToDiscovery() },
                    onEnterSSID: { captureFlow.startSonySSIDStub() },
                    onManualIP: { captureFlow.skipToManualEntry() }
                )
                .transition(.opacity)
                .id("sony-new-camera-decision")

            case let .sonyWiFiOnboarding(mode):
                SonyWiFiOnboardingView(
                    mode: mode == .qr ? .qr : .manual,
                    onBack: { captureFlow.state = .sonyNewCameraDecision },
                    onContinue: { _ in captureFlow.proceedToDiscovery() }
                )
                .transition(.opacity)
                .id("sony-wifi-onboarding")

            case .hotspotSetup:
                HotspotSetupView()
                    .transition(.opacity)
                    .id("hotspot-setup")

            case .discovering:
                if captureFlow.selectedManufacturer == .sony {
                    let preferredIP: String? = {
                        guard let id = captureFlow.preferredSonyRecordID else { return nil }
                        let uuid = UUID(uuidString: id)
                        return APCameraConnectionStore.shared.listRecords(manufacturer: .sony).first(where: {
                            $0.id == uuid
                        })?.lastKnownCameraIP
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
                        }
                    )
                    .transition(.opacity)
                    .id("sony-ap-discovery")
                } else {
                    CameraDiscoveryView()
                        .transition(.opacity)
                        .id("camera-discovery")
                }

            case .manualIPEntry:
                // Manual IP entry (fallback from discovery)
                ManualIPEntryView()
                    .transition(.opacity)
                    .id("manual-ip-entry")

            case .connecting(let ip):
                // Connecting view with IP display
                ConnectingView(ipAddress: ip)
                    .transition(.opacity)
                    .id("connecting-\(ip)")

            case .transferring:
                // IMPORTANT: Keep coordinator.transferSession reference (global state)
                if let session = coordinator.transferSession {
                    LiveCaptureView(session: session) {
                        // Navigation callback
                        captureFlow.state = .manufacturerSelection
                        coordinator.transferSession = nil
                    }
                    .transition(.opacity)
                    .id("transferring")
                }

            case .error(let message):
                ConnectionErrorView(errorMessage: message, onTryAgain: { captureFlow.backToManufacturerSelection() })
                    .transition(.opacity)
                    .id("error")
            }
        }
    }
}
