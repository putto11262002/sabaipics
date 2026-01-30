//
//  CameraDiscoveryView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  SAB-23/SAB-24: Camera discovery UI with unified layout
//
//  Unified view where the camera list is always present and selectable,
//  with a small status indicator showing scan state.
//

import SwiftUI

/// Camera discovery view - unified layout with always-visible camera list
struct CameraDiscoveryView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // CHANGED
    @StateObject private var scanner = NetworkScannerService()

    /// Whether to show the back confirmation dialog
    @State private var showBackConfirmation = false

    /// Timer for 30-second timeout
    @State private var timeoutTask: Task<Void, Never>?

    // MARK: - Computed Properties

    /// Whether we're currently scanning
    private var isScanning: Bool {
        if case .scanning = scanner.state { return true }
        return false
    }

    /// Whether scan completed with no cameras
    private var isEmptyAfterScan: Bool {
        if case .completed(let count) = scanner.state, count == 0 {
            return true
        }
        return false
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Main content - camera list or empty state
            mainContent

            // Footer with manual IP entry (no divider)
            footerView
                .padding(.vertical, 16)
        }
        .navigationTitle("Find Cameras")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(content: toolbarContent)
        .onAppear {
            print("[CameraDiscoveryView] View appeared, starting scan")

            // Register cleanup for this stage
            captureFlow.registerCleanup { [weak scanner] in
                print("[CameraDiscoveryView] Running registered cleanup")
                await scanner?.cleanup()
            }

            startScanWithTimeout()
        }
        .onDisappear {
            timeoutTask?.cancel()
            captureFlow.unregisterCleanup()
        }
        .onChange(of: scanner.discoveredCameras) { newCameras in
            print("[CameraDiscoveryView] Cameras updated: \(newCameras.count) found")
            captureFlow.updateDiscoveredCameras(newCameras)  // CHANGED
        }
        .alert("Stop scanning?", isPresented: $showBackConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Go Back", role: .destructive) {
                handleBack()
            }
        } message: {
            Text("Go back to manufacturer selection?")
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private func toolbarContent() -> some ToolbarContent {
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

    // MARK: - Main Content

    @ViewBuilder
    private var mainContent: some View {
        if !scanner.discoveredCameras.isEmpty {
            // Camera list
            cameraList
        } else if isScanning {
            // Scanning empty state
            scanningEmptyState
        } else if isEmptyAfterScan {
            // No cameras empty state
            noCamerasEmptyState
        } else {
            // Initial state (shouldn't normally be visible)
            scanningEmptyState
        }
    }

    // MARK: - Camera List

    private var cameraList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(scanner.discoveredCameras) { camera in
                    CameraRow(camera: camera) {
                        selectCamera(camera)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 16)
        }
    }

    // MARK: - Empty States

    /// Empty state while scanning (no cameras found yet)
    private var scanningEmptyState: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "camera.viewfinder")
                .font(.system(size: 50))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

            VStack(spacing: 12) {
                Text("Looking for cameras...")
                    .font(.title3)
                    .fontWeight(.medium)

                Text("Make sure your camera is connected to the Personal Hotspot and WiFi transfer mode is enabled.")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
    }

    /// Empty state when scan complete but no cameras found
    private var noCamerasEmptyState: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "camera.badge.ellipsis")
                .font(.system(size: 50))
                .foregroundColor(Color.Theme.mutedForeground.opacity(0.6))

            VStack(spacing: 12) {
                Text("No cameras found")
                    .font(.title3)
                    .fontWeight(.medium)

                Text("Check that your camera is connected to the Personal Hotspot and WiFi transfer mode is enabled.")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            // Rescan button
            Button("Rescan") {
                print("[CameraDiscoveryView] Rescan tapped")
                startScanWithTimeout()
            }
            .buttonStyle(.primary)
            .padding(.horizontal, 40)
            .padding(.top, 8)

            Spacer()
        }
    }

    // MARK: - Footer

    private var footerView: some View {
        Button("Enter IP Manually") {
            print("[CameraDiscoveryView] Enter IP Manually tapped")
            // Cancel timeout task
            timeoutTask?.cancel()

            // Call registered cleanup then navigate
            Task {
                await captureFlow.cleanup()  // Stops scan AND disconnects cameras
                captureFlow.skipToManualEntry()
            }
        }
        .font(.subheadline)
        .foregroundColor(Color.Theme.mutedForeground)
    }

    // MARK: - Actions

    /// Start scan (no timeout - scanner completes naturally after all waves)
    /// User can cancel manually via Back button or by selecting a camera
    private func startScanWithTimeout() {
        print("[CameraDiscoveryView] Starting scan (no timeout, waves will complete naturally)")

        // Cancel any existing timeout task (legacy, kept for safety)
        timeoutTask?.cancel()

        // Start scanning - scanner will complete after all waves (max ~15s)
        // User can cancel anytime via Back button
        scanner.startScan()
    }

    /// Handle camera selection
    /// Flow: Cancel timeout -> Stop scan -> Extract session -> Disconnect others -> Proceed
    private func selectCamera(_ camera: DiscoveredCamera) {
        print("[CameraDiscoveryView] selectCamera(\(camera.name))")

        // 1. Cancel timeout task
        timeoutTask?.cancel()
        print("[CameraDiscoveryView]    Timeout cancelled")

        // 2. Stop scanning (just cancels tasks, does NOT disconnect cameras)
        scanner.stopScan()
        print("[CameraDiscoveryView]    Scan stopped")

        // 3. Tell coordinator to handle selection
        // Coordinator will: extract session, disconnect OTHER cameras, start transfer
        captureFlow.selectDiscoveredCamera(camera)  // CHANGED
        print("[CameraDiscoveryView]    Passed to coordinator")
    }

    /// Handle back button
    /// Flow: Cancel timeout -> Cleanup scanner (stop + disconnect all) -> Navigate back
    private func handleBack() {
        print("[CameraDiscoveryView] handleBack()")

        // Cancel timeout task
        timeoutTask?.cancel()
        print("[CameraDiscoveryView]    Timeout cancelled")

        // Call registered cleanup then navigate
        Task {
            await captureFlow.cleanup()  // Uses registered cleanup
            captureFlow.backToManufacturerSelection()
        }
    }
}

// MARK: - Camera Row

/// Single camera row in the discovery list
/// Shows camera name only (no IP address - keep it simple)
struct CameraRow: View {
    let camera: DiscoveredCamera
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 16) {
                // Camera icon
                Image(systemName: "camera.fill")
                    .font(.title2)
                    .foregroundColor(Color.Theme.primary)
                    .frame(width: 50, height: 50)
                    .background(Color.Theme.primary.opacity(0.1))
                    .cornerRadius(10)

                // Camera name
                Text(camera.name)
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)

                Spacer()

                // Session status indicator (green = ready to connect instantly)
                if camera.hasActiveSession {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 10, height: 10)
                }

                Image(systemName: "chevron.right")
                    .foregroundColor(Color.Theme.mutedForeground)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
        }
    }
}

// MARK: - Previews

#Preview("Scanning") {
    NavigationView {
        CameraDiscoveryView()
            .environmentObject(AppCoordinator())
    }
}
