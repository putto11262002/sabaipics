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

                // Content based on app state
                switch viewModel.appState {
                case .searching:
                    // NEW: WiFi setup instead of USB search
                    WiFiSetupView(viewModel: viewModel)

                case .cameraFound(let camera):
                    // USB legacy (disabled)
                    CameraFoundView(camera: camera) {
                        viewModel.connectToCamera(camera)
                    }

                case .connecting:
                    // NEW: Connecting view
                    ConnectingView()

                case .ready:
                    ReadyView()

                case .capturing:
                    // Live capture view (existing)
                    LiveCaptureView(viewModel: viewModel)

                case .error(let message):
                    // Error view (existing)
                    ErrorView(message: message) {
                        viewModel.appState = .searching
                    }
                }
            }
            .navigationTitle("SabaiPics Studio")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack) // Forces single-column layout on iPad (no sidebar)
    }
}

/// View shown while connecting to camera
struct ConnectingView: View {
    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .scaleEffect(1.5)
                .progressViewStyle(CircularProgressViewStyle(tint: .blue))

            Text("Connecting to camera...")
                .font(.headline)
                .foregroundColor(.secondary)
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
    ContentView()
}
