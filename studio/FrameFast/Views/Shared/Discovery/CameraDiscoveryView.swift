//
//  CameraDiscoveryView.swift
//  FrameFast
//
//  Shared camera discovery UI used by manufacturer-specific flows.
//

import SwiftUI

struct CameraDiscoveryView: View {
    @StateObject private var viewModel: CameraDiscoveryViewModel

    private let preferredIP: String?
    private let showsManualIP: Bool

    private let onBack: () -> Void
    private let onManualIP: () -> Void
    private let onSelect: (_ camera: DiscoveredCamera, _ allCameras: [DiscoveredCamera]) -> Void
    private let onDone: (() -> Void)?

    private let continuous: Bool

    @MainActor
    init(
        preferredIP: String? = nil,
        showsManualIP: Bool = true,
        continuous: Bool = false,
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
        self.continuous = continuous
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
                CameraDiscoveryTimedOutView(
                    onRetry: {
                        Task { await viewModel.retry(preferredIP: preferredIP) }
                    }
                )
            case .error(let kind):
                if kind == .localNetworkDenied {
                    CameraDiscoveryLocalNetworkDeniedView(
                        title: String(localized: "Allow Local Network access"),
                        message: String(localized: "FrameFast Studio needs Local Network access to discover and connect to cameras on your WiFi network."),
                        bullets: [
                            String(localized: "If you see a permission prompt, tap Allow"),
                            String(localized: "If you previously denied, enable it in Settings → Privacy & Security → Local Network")
                        ],
                        onRetry: {
                            Task { await viewModel.retry(preferredIP: preferredIP) }
                        }
                    )
                } else {
                    CameraDiscoveryNotFoundView(
                        title: String(localized: "Connection failed"),
                        message: String(localized: "Unable to connect to camera. Check your connection and try again."),
                        bullets: [],
                        iconSystemName: "exclamationmark.triangle",
                        onRetry: {
                            Task { await viewModel.retry(preferredIP: preferredIP) }
                        }
                    )
                }
            case .scanning:
                CameraDiscoveryScanningView(
                    title: String(localized: "Looking for cameras..."),
                    message: String(localized: "Scanning your network for available cameras.")
                )
            case .needsNetworkHelp:
                CameraDiscoveryNetworkHelpView(
                    title: String(localized: "Not connected to camera WiFi"),
                    message: String(localized: "Go to Settings › WiFi and connect to your camera's network, then try again."),
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
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.large)
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
                            .foregroundStyle(Color.accentColor)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task {
            if continuous {
                await viewModel.startContinuous(preferredIP: preferredIP)
            } else {
                await viewModel.start(preferredIP: preferredIP)
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

    private var navigationTitleText: String {
        switch viewModel.state {
        case .scanning: return String(localized: "Looking for cameras…")
        case .found: return String(localized: "Connect camera")
        case .timedOut: return String(localized: "No camera found")
        case .error(let kind):
            return kind == .localNetworkDenied ? String(localized: "Allow Local Network access") : String(localized: "Connection failed")
        case .needsNetworkHelp: return String(localized: "No WiFi")
        }
    }

    private var cleanupOverlay: some View {
        ZStack {
            Color.black.opacity(0.15)
                .ignoresSafeArea()

            ProgressView()
                .scaleEffect(1.2)
                .padding(20)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

}

#if DEBUG

#Preview("Camera Discovery") {
    NavigationStack {
        CameraDiscoveryView(
            makeScanTargets: { _ in ["192.168.1.1"] },
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#endif
