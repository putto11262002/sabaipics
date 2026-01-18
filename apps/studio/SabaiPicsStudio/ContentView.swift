//
//  ContentView.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var coordinator: AppCoordinator

    var body: some View {
        NavigationView {
            ZStack {
                // Background color
                Color(.systemBackground)
                    .ignoresSafeArea()

                // Content based on app state
                switch coordinator.appState {
                case .idle:
                    // WiFi setup page - waiting for user input
                    WiFiSetupView()
                        .transition(.opacity)
                        .id("wifi-setup")  // Force NavigationView to recognize as distinct view

                case .cameraFound(let camera):
                    // USB legacy (disabled)
                    CameraFoundView(camera: camera) {
                        // Note: This is legacy USB code, not refactored yet
                    }
                    .id("camera-found")

                case .connecting:
                    // Premium connecting view with retry status
                    ConnectingView()
                        .transition(.opacity)
                        .id("connecting")

                case .connected:
                    // Success celebration (auto-transitions via AppCoordinator)
                    ConnectedView()
                        .transition(.scale.combined(with: .opacity))
                        .id("connected")

                case .ready:
                    ReadyView()
                        .id("ready")

                case .capturing:
                    // Live capture view
                    LiveCaptureView()
                        .transition(.opacity)
                        .id("capturing")  // Distinct identity for toolbar cleanup

                case .error(let message):
                    // Premium error view
                    ConnectionErrorView(errorMessage: message)
                        .transition(.opacity)
                        .id("error")
                }
            }
            .navigationTitle("SabaiPics Studio")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack) // Forces single-column layout on iPad (no sidebar)
        .customConfirmationDialog(
            isPresented: $coordinator.showDisconnectAlert,
            title: "Disconnect from camera?",
            message: "Photos will be cleared. Make sure you've saved what you need.",
            confirmLabel: "Disconnect",
            isDestructive: true
        ) {
            coordinator.confirmDisconnect()
        }
    }
}

/// View shown when ready to shoot
struct ReadyView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "camera.aperture")
                .font(.system(size: 80))
                .foregroundColor(.green)

            Text("Ready to Shoot")
                .font(.title)
                .fontWeight(.bold)

            Text("Take photos with camera shutter")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Text("0 photos captured")
                .font(.headline)
                .padding(.top, 20)
        }
    }
}

/// View shown when there's an error
struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundColor(.red)

            Text("Error")
                .font(.title)
                .fontWeight(.bold)

            Text(message)
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button(action: onRetry) {
                Text("Try Again")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)
        }
    }
}

#Preview {
    let coordinator = AppCoordinator()
    return ContentView()
        .environmentObject(coordinator)
        .environmentObject(coordinator.connectionStore)
        .environmentObject(coordinator.photoStore)
}
