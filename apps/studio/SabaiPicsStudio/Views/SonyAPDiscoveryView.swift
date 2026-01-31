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

            startSonyProbe()
        }
        .onDisappear {
            captureFlow.unregisterCleanup()
        }
        .onChange(of: scanner.discoveredCameras) { cameras in
            captureFlow.updateDiscoveredCameras(cameras)

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

                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 50))
                    .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

                VStack(spacing: 10) {
                    Text("Looking for your Sony camera...")
                        .font(.title3)
                        .fontWeight(.medium)

                    Text("Make sure you are connected to the camera WiFi (DIRECT-...).")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                if let wifiInfo {
                    VStack(spacing: 6) {
                        Text("WiFi IP: \(wifiInfo.ipString)")
                        Text("Subnet: \(wifiInfo.netmaskString)")
                    }
                    .font(.caption)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.top, 6)
                }

                if case .error(let message) = scanner.state {
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                        .padding(.top, 8)
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
        var preferredIP: String?
        if let id = captureFlow.preferredSonyRecordID {
            let record = SonyAPConnectionCache.shared.listRecords().first(where: { $0.id == id })
            preferredIP = record?.lastKnownCameraIP
        }

        let candidates = SonyAPDiscovery.candidateIPs(preferredIP: preferredIP)
        scanner.startScan(candidateIPs: candidates, perIPTimeout: 1.0)
    }
}
