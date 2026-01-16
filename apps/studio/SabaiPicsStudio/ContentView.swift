//
//  ContentView.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = CameraViewModel()

    var body: some View {
        NavigationView {
            ZStack {
                // Background color
                Color(.systemBackground)
                    .ignoresSafeArea()

                // Content based on app state (Phase 5: Premium routing)
                switch viewModel.appState {
                case .idle:
                    // WiFi setup page - waiting for user input
                    WiFiSetupView(viewModel: viewModel)
                        .transition(.opacity)

                case .cameraFound(let camera):
                    // USB legacy (disabled)
                    CameraFoundView(camera: camera) {
                        viewModel.connectToCamera(camera)
                    }

                case .connecting:
                    // Phase 5: Premium connecting view with retry status
                    ConnectingView(
                        ipAddress: viewModel.currentIP ?? "...",
                        retryCount: viewModel.retryCount,
                        maxRetries: 3
                    )
                    .transition(.opacity)

                case .connected:
                    // Phase 5: Success celebration (1s auto-transition)
                    ConnectedView(
                        cameraModel: "Canon EOS",
                        ipAddress: viewModel.currentIP ?? "",
                        shouldDismiss: $viewModel.shouldDismissConnected
                    )
                    .transition(.scale.combined(with: .opacity))

                case .ready:
                    ReadyView()

                case .capturing:
                    // Live capture view
                    LiveCaptureView(viewModel: viewModel)
                        .transition(.opacity)

                case .error(let message):
                    // Phase 5: Premium error view
                    ConnectionErrorView(
                        errorMessage: message,
                        onTryAgain: {
                            withAnimation {
                                viewModel.appState = .idle
                                viewModel.wifiService.cancelRetry()
                            }
                        }
                    )
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut, value: viewModel.appState)
            .navigationTitle("SabaiPics Studio")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack) // Forces single-column layout on iPad (no sidebar)
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
    ContentView()
}
