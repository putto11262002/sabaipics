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
                    SearchingView(isSearching: $viewModel.isSearching)

                case .cameraFound(let camera):
                    CameraFoundView(camera: camera) {
                        viewModel.connectToCamera(camera)
                    }

                case .connecting:
                    ConnectingView()

                case .ready:
                    ReadyView()

                case .capturing:
                    LiveCaptureView(viewModel: viewModel)

                case .error(let message):
                    ErrorView(message: message) {
                        viewModel.startSearching()
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
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Connecting...")
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
