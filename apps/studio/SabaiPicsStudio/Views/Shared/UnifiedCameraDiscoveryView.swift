//
//  UnifiedCameraDiscoveryView.swift
//  SabaiPicsStudio
//
//  Shared camera discovery UI used by manufacturer-specific flows.
//

import SwiftUI

struct UnifiedCameraDiscoveryView<Strategy: CameraDiscoveryStrategizing & CameraDiscoveryGuidanceProviding>: View {
    @StateObject private var viewModel: CameraDiscoveryViewModel<Strategy>

    private let startScanOnAppear: Bool
    private let preferredIP: String?

    private let onBack: () -> Void
    private let onManualIP: () -> Void
    private let onSelect: (_ camera: DiscoveredCamera, _ allCameras: [DiscoveredCamera]) -> Void

    @MainActor
    init(
        viewModel: CameraDiscoveryViewModel<Strategy>? = nil,
        discoverer: CameraDiscovering? = nil,
        strategy: Strategy,
        preferredIP: String? = nil,
        startScanOnAppear: Bool = true,
        onBack: @escaping () -> Void,
        onManualIP: @escaping () -> Void,
        onSelect: @escaping (_ camera: DiscoveredCamera, _ allCameras: [DiscoveredCamera]) -> Void
    ) {
        _viewModel = StateObject(
            wrappedValue: viewModel ?? CameraDiscoveryViewModel(
                discoverer: discoverer ?? NetworkScannerDiscoverer(),
                strategy: strategy
            )
        )
        self.preferredIP = preferredIP
        self.startScanOnAppear = startScanOnAppear
        self.onBack = onBack
        self.onManualIP = onManualIP
        self.onSelect = onSelect
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                mainContent

                if showsFooter {
                    footer
                        .padding(.vertical, 16)
                }
            }

            if viewModel.isCleaningUp {
                cleanupOverlay
            }
        }
        .navigationTitle(viewModel.navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton(confirmation: viewModel.backConfirmation) {
            viewModel.stop()
            await viewModel.cleanupWithTimeout()
            onBack()
        }
        .onAppear {
            if startScanOnAppear {
                viewModel.start(preferredIP: preferredIP)
            }
        }
        .onDisappear {
            viewModel.stop()
        }
        .onChange(of: viewModel.autoSelectCamera) { camera in
            guard let camera else { return }
            viewModel.stop()
            onSelect(camera, viewModel.cameras)
            viewModel.autoSelectCamera = nil
        }
    }

    private var showsFooter: Bool {
        switch viewModel.state {
        case .found:
            return false
        case .scanning:
            return viewModel.secondaryActionTitle != nil
        case .needsNetworkHelp:
            return true
        case .timedOut, .error:
            return true
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        switch viewModel.state {
        case .found:
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.cameras) { camera in
                        CameraRow(camera: camera) {
                            viewModel.stop()
                            onSelect(camera, viewModel.cameras)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 16)
            }
        case .scanning, .needsNetworkHelp, .timedOut, .error:
            if let guidance = viewModel.guidance {
                discoveryGuidance(guidance)
            } else {
                EmptyView()
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 10) {
            switch viewModel.state {
            case .found:
                EmptyView()

            case .scanning:
                if let secondary = viewModel.secondaryActionTitle {
                    Button(secondary) {
                        Task {
                            viewModel.stop()
                            await viewModel.cleanupWithTimeout()
                            onManualIP()
                        }
                    }
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                } else {
                    EmptyView()
                }

            case .needsNetworkHelp:
                Button(viewModel.primaryActionTitle) {
                    viewModel.retry(preferredIP: preferredIP)
                }
                .buttonStyle(.secondary)

            case .timedOut, .error:
                Button(viewModel.primaryActionTitle) {
                    viewModel.retry(preferredIP: preferredIP)
                }
                .buttonStyle(.secondary)

                if let secondary = viewModel.secondaryActionTitle {
                    Button(secondary) {
                        Task {
                            viewModel.stop()
                            await viewModel.cleanupWithTimeout()
                            onManualIP()
                        }
                    }
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                }
            }
        }
        .padding(.horizontal, 24)
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

    private func discoveryGuidance(_ guidance: GuidanceModel) -> some View {
        VStack(spacing: 20) {
            Spacer()

            if let icon = guidance.iconSystemName {
                Image(systemName: icon)
                    .font(.system(size: 50))
                    .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))
            }

            VStack(spacing: 10) {
                Text(guidance.title)
                    .font(.title3)
                    .fontWeight(.medium)

                if !guidance.message.isEmpty {
                    Text(guidance.message)
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                if !guidance.bullets.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(guidance.bullets, id: \.self) { bullet in
                            HStack(alignment: .top, spacing: 8) {
                                Text("-")
                                    .foregroundColor(Color.Theme.mutedForeground)
                                Text(bullet)
                                    .foregroundColor(Color.Theme.mutedForeground)
                            }
                            .font(.subheadline)
                        }
                    }
                    .padding(.horizontal, 40)
                }
            }

            Spacer()
        }
    }
}

#if DEBUG

@MainActor
private func makeUnifiedVM(
    state: DiscoveryUIState,
    cameras: [DiscoveredCamera] = []
) -> CameraDiscoveryViewModel<SonyAPDiscoveryStrategy> {
    CameraDiscoveryViewModel(
        discoverer: NetworkScannerDiscoverer(),
        strategy: SonyAPDiscoveryStrategy(),
        initialState: state,
        initialCameras: cameras
    )
}

private let previewSony1 = DiscoveredCamera(
    name: "Sony A7 IV",
    ipAddress: "192.168.1.1",
    connectionNumber: 1,
    session: nil
)

private let previewSony2 = DiscoveredCamera(
    name: "Sony FX3",
    ipAddress: "192.168.1.2",
    connectionNumber: 2,
    session: nil
)

private let previewSony3 = DiscoveredCamera(
    name: "Sony A7S III",
    ipAddress: "192.168.1.3",
    connectionNumber: 3,
    session: nil
)

#Preview("Unified Discovery - Scanning") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .scanning),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#Preview("Unified Discovery - Network Help") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .needsNetworkHelp),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#Preview("Unified Discovery - Not Found") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .timedOut),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#Preview("Unified Discovery - Error") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .error(.unknown("Connection failed"))),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#Preview("Unified Discovery - Found") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .found, cameras: [previewSony1]),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#Preview("Unified Discovery - Found (Multiple)") {
    NavigationView {
        UnifiedCameraDiscoveryView(
            viewModel: makeUnifiedVM(state: .found, cameras: [previewSony1, previewSony2, previewSony3]),
            strategy: SonyAPDiscoveryStrategy(),
            startScanOnAppear: false,
            onBack: {},
            onManualIP: {},
            onSelect: { _, _ in }
        )
    }
}

#endif
