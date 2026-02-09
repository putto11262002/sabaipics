//
//  CameraDiscoveryScreen.swift
//  FrameFast
//
//  Shared camera discovery UI used by manufacturer-specific flows.
//

import SwiftUI

struct CameraDiscoveryScreen: View {
    @StateObject private var viewModel: CameraDiscoveryViewModel

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
                CameraDiscoveryNotFoundView(
                    title: "No camera found",
                    message: "Make sure your camera is turned on and connected to the network.",
                    bullets: [],
                    iconSystemName: "camera.metering.unknown",
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
            case .error:
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
            case .scanning:
                CameraDiscoveryScanningView(
                    title: "Looking for cameras...",
                    message: "Scanning your network for available cameras."
                )
            case .needsNetworkHelp:
                CameraDiscoveryNetworkHelpView(
                    title: "No network connection",
                    message: "Connect to WiFi to discover cameras.",
                    bullets: [],
                    onRetry: {
                        Task { await viewModel.retry(preferredIP: preferredIP) }
                    }
                )
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
        .task {
            await viewModel.start(preferredIP: preferredIP)
        }
        .onChange(of: viewModel.autoSelectCamera) { camera in
            guard let camera else { return }
            Task { await viewModel.stop() }
            viewModel.releaseCamera(camera)
            onSelect(camera, viewModel.cameras)
            viewModel.autoSelectCamera = nil
        }
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
