//  SonyAPDiscoveryView.swift
//  SabaiPicsStudio
//
//  Sony AP-mode discovery: probe a small set of candidate IPs and connect.
//

import SwiftUI

struct SonyAPDiscoveryView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    @StateObject private var scanner = NetworkScannerService()

    @State private var showBackConfirmation = false
    @State private var timeoutTask: Task<Void, Never>?
    @State private var didTimeout = false
    private let startScanOnAppear: Bool

    @MainActor
    init(
        scanner: NetworkScannerService? = nil,
        didTimeout: Bool = false,
        startScanOnAppear: Bool = true
    ) {
        _scanner = StateObject(wrappedValue: scanner ?? NetworkScannerService())
        _didTimeout = State(initialValue: didTimeout)
        self.startScanOnAppear = startScanOnAppear
    }

    private var wifiInfo: WiFiIPv4Info? {
        WiFiNetworkInfo.currentWiFiIPv4()
    }

    var body: some View {
        VStack(spacing: 0) {
            mainContent

            footer
                .padding(.vertical, 16)
        }
        .navigationTitle("Connect Sony")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    showBackConfirmation = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .foregroundColor(Color.Theme.primary)
                }
            }
        }
        .onAppear {
            captureFlow.registerCleanup { [weak scanner] in
                await scanner?.cleanup()
            }

            if startScanOnAppear {
                startSonyProbe()
                startTimeout()
            }
        }
        .onDisappear {
            timeoutTask?.cancel()
            captureFlow.unregisterCleanup()
        }
        .onChange(of: scanner.discoveredCameras) { cameras in
            captureFlow.updateDiscoveredCameras(cameras)

            if !cameras.isEmpty {
                timeoutTask?.cancel()
            }

            // Auto-select the first Sony camera as soon as it is ready.
            if let camera = cameras.first, SonyAPDiscovery.isSonyCameraName(camera.name) {
                scanner.stopScan()
                captureFlow.selectDiscoveredCamera(camera)
            }
        }
        .alert("Stop connecting?", isPresented: $showBackConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Go Back", role: .destructive) {
                Task {
                    await captureFlow.cleanup()
                    captureFlow.backToManufacturerSelection()
                }
            }
        } message: {
            Text("Return to manufacturer selection?")
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        if !scanner.discoveredCameras.isEmpty {
            // Reuse the same list style: allow user selection if multiple found
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(scanner.discoveredCameras) { camera in
                        CameraRow(camera: camera) {
                            scanner.stopScan()
                            captureFlow.selectDiscoveredCamera(camera)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 16)
            }
        } else {
            VStack(spacing: 20) {
                Spacer()

                Image(systemName: didTimeout ? "exclamationmark.triangle" : "camera.viewfinder")
                    .font(.system(size: 50))
                    .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

                if case .error(let message) = scanner.state {
                    VStack(spacing: 8) {
                        Text("Connection problem")
                            .font(.title3)
                            .fontWeight(.medium)

                        Text(message)
                            .font(.subheadline)
                            .foregroundColor(Color.Theme.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                } else if didTimeout {
                    VStack(spacing: 8) {
                        Text("Camera not found")
                            .font(.title3)
                            .fontWeight(.medium)

                        Text("Try again or enter the IP manually.")
                            .font(.subheadline)
                            .foregroundColor(Color.Theme.mutedForeground)
                    }
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                } else {
                    Text("Looking for your Sony camera...")
                        .font(.title3)
                        .fontWeight(.medium)
                }

                Spacer()
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Button("Try Again") {
                startSonyProbe()
            }
            .buttonStyle(.secondary)

            Button("Enter IP Manually") {
                Task {
                    await captureFlow.cleanup()
                    captureFlow.skipToManualEntry()
                }
            }
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
        }
        .padding(.horizontal, 24)
    }

    private func startSonyProbe() {
        didTimeout = false
        var preferredIP: String?
        if let id = captureFlow.preferredSonyRecordID {
            let record = SonyAPConnectionCache.shared.listRecords().first(where: { $0.id == id })
            preferredIP = record?.lastKnownCameraIP
        }

        let candidates = SonyAPDiscovery.candidateIPs(preferredIP: preferredIP)
        scanner.startScan(candidateIPs: candidates, perIPTimeout: 1.0)
    }

    private func startTimeout() {
        timeoutTask?.cancel()
        timeoutTask = Task {
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            if !Task.isCancelled, scanner.discoveredCameras.isEmpty {
                didTimeout = true
            }
        }
    }
}
