//
//  CameraDiscoveryScreen.swift
//  FrameFast
//
//  Shared camera discovery UI used by manufacturer-specific flows.
//

import SwiftUI

struct CameraDiscoveryScreen: View {
    @StateObject private var viewModel: CameraDiscoveryViewModel
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    @State private var showInternetGuide: Bool = false
    @State private var hasStarted: Bool = false

    private let preferredIP: String?
    private let showsManualIP: Bool

    private let onBack: () -> Void
    private let onManualIP: () -> Void
    private let onSelect: (_ camera: DiscoveredCamera, _ allCameras: [DiscoveredCamera]) -> Void
    private let onDone: (() -> Void)?

    @MainActor
    init(
        preferredIP: String? = nil,
        showsManualIP: Bool = true,
        makeScanTargets: @escaping (_ preferredIP: String?) -> [String],
        scanConfig: ScanConfig = .default,
        preflight: @escaping () -> CameraDiscoveryPreflightResult = {
            WiFiNetworkInfo.currentWiFiIPv4() == nil ? .needsNetworkHelp(.notOnLocalNetwork) : .ok
        },
        autoSelect: @escaping (_ cameras: [DiscoveredCamera]) -> DiscoveredCamera? = { _ in nil },
        onBack: @escaping () -> Void,
        onManualIP: @escaping () -> Void,
        onSelect: @escaping (_ camera: DiscoveredCamera, _ allCameras: [DiscoveredCamera]) -> Void,
        onDone: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(
            wrappedValue: CameraDiscoveryViewModel(
                preflight: preflight,
                makeScanTargets: makeScanTargets,
                scanConfig: scanConfig,
                autoSelect: autoSelect
            )
        )
        self.preferredIP = preferredIP
        self.showsManualIP = showsManualIP
        self.onBack = onBack
        self.onManualIP = onManualIP
        self.onSelect = onSelect
        self.onDone = onDone
    }

    var body: some View {
        ZStack {
            if showInternetGuide {
                ConnectivityGuideFlow(
                    isOnline: connectivityStore.isOnline,
                    ipAddress: WiFiNetworkInfo.currentWiFiIPv4()?.ipString ?? "192.168.1.10",
                    subnetMask: WiFiNetworkInfo.currentWiFiIPv4()?.netmaskString ?? "255.255.255.0",
                    onSkip: {
                        showInternetGuide = false
                        Task { await startIfNeeded() }
                    },
                    onDone: {
                        showInternetGuide = false
                        Task { await startIfNeeded() }
                    }
                )
            } else {
                switch viewModel.state {
                case .found:
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.cameras) { camera in
                                CameraRow(camera: camera) {
                                    Task { await viewModel.stop() }
                                    viewModel.releaseCamera(camera)
                                    onSelect(camera, viewModel.cameras)
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 16)
                    }
                case .timedOut:
                    CameraDiscoveryTimedOutView(
                        showsManualIP: showsManualIP,
                        onRetry: {
                            Task { await viewModel.retry(preferredIP: preferredIP) }
                        },
                        onManualIP: {
                            Task {
                                await viewModel.cleanupWithTimeout()
                                onManualIP()
                            }
                        }
                    )
                case .error(let kind):
                    if kind == .localNetworkDenied {
                        CameraDiscoveryLocalNetworkDeniedView(
                            title: "Allow Local Network access",
                            message: "FrameFast Studio needs Local Network access to discover and connect to cameras on your WiFi network.",
                            bullets: [
                                "If you see a permission prompt, tap Allow",
                                "If you previously denied, enable it in Settings → Privacy & Security → Local Network"
                            ],
                            onRetry: {
                                Task { await viewModel.retry(preferredIP: preferredIP) }
                            }
                        )
                    } else {
                        CameraDiscoveryNotFoundView(
                            title: "Connection failed",
                            message: "Unable to connect to camera. Check your connection and try again.",
                            bullets: [],
                            iconSystemName: "exclamationmark.triangle",
                            showsManualIP: showsManualIP,
                            onRetry: {
                                Task { await viewModel.retry(preferredIP: preferredIP) }
                            },
                            onManualIP: {
                                Task {
                                    await viewModel.cleanupWithTimeout()
                                    onManualIP()
                                }
                            }
                        )
                    }
                case .scanning:
                    CameraDiscoveryScanningView(
                        title: "Looking for cameras...",
                        message: "Scanning your network for available cameras."
                    )
                case .needsNetworkHelp:
                    CameraDiscoveryNetworkHelpView(
                        title: "Not connected to camera WiFi",
                        message: "Go to Settings › WiFi and connect to your camera's network, then try again.",
                        bullets: [],
                        onRetry: {
                            Task { await viewModel.retry(preferredIP: preferredIP) }
                        }
                    )
                }
            }

            if viewModel.isCleaningUp {
                cleanupOverlay
            }
        }
        .navigationTitle("Connect camera")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            await viewModel.cleanupWithTimeout()
            onBack()
        }
        .toolbar {
            if let onDone {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task {
                            await viewModel.cleanupWithTimeout()
                            onDone()
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.Theme.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task {
            // Force a fresh health probe so we don't rely on stale cached state
            // (e.g. user just switched from home WiFi to camera WiFi with no internet).
            let fresh = await connectivityStore.probeNow()
            if fresh.isOffline {
                showInternetGuide = true
            } else {
                await startIfNeeded()
            }
        }
        .onChange(of: viewModel.autoSelectCamera) { camera in
            guard let camera else { return }
            Task { await viewModel.stop() }
            viewModel.releaseCamera(camera)
            onSelect(camera, viewModel.cameras)
            viewModel.autoSelectCamera = nil
        }
    }

    @MainActor
    private func startIfNeeded() async {
        guard !hasStarted else { return }
        hasStarted = true
        await viewModel.start(preferredIP: preferredIP)
    }

    private var cleanupOverlay: some View {
        ZStack {
            Color.black.opacity(0.15)
                .ignoresSafeArea()

            VStack(spacing: 12) {
                ProgressView()
                    .scaleEffect(1.1)

                Text("Disconnecting...")
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)

                Text("Closing camera connections")
                    .font(.footnote)
                    .foregroundColor(Color.Theme.mutedForeground)
            }
            .padding(18)
            .background(Color.Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
        }
    }

}

#if DEBUG

// Note: Previews temporarily removed - need to extract state-specific views for previewing

#endif
