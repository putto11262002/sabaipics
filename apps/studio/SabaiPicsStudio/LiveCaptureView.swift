//
//  LiveCaptureView.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//  Option 4: Navigation Bar + Photo Count (hybrid approach)
//

import SwiftUI

/// View shown during active photo capture session
/// Pattern: Hybrid - navigation bar with title/subtitle + photo count in trailing
struct LiveCaptureView: View {
    @ObservedObject var viewModel: CameraViewModel
    @State private var showDisconnectAlert = false
    @State private var userConfirmedDisconnect = false

    var body: some View {
        VStack(spacing: 0.0) {
            Divider()
                .background(Color(UIColor.separator))

            List {
                ForEach(viewModel.capturedPhotos) { photo in
                    PhotoListRow(photo: photo)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))
                }
            }
            .listStyle(.plain)
            .animation(.easeOut(duration: 0.4), value: viewModel.capturedPhotos)
        }
        .toolbar {
            // Principal: Event name + camera name with status
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(viewModel.eventName)
                        .font(.headline)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Circle()
                            .fill(viewModel.wifiService.isConnected ? Color.green : Color.gray)
                            .frame(width: 8, height: 8)
                        Text(viewModel.cameraName)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            // Trailing: Disconnect button
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    showDisconnectAlert = true
                }) {
                    Text("Disconnect")
                        .foregroundColor(.red)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color(UIColor.systemBackground), for: .navigationBar)
        .alert("Disconnect from camera?", isPresented: $showDisconnectAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Disconnect", role: .destructive) {
                userConfirmedDisconnect = true
                // Alert auto-dismisses, then .onChange fires
            }
        } message: {
            Text("Photos will be cleared. Make sure you've saved what you need.")
        }
        .onChange(of: showDisconnectAlert) { isShowing in
            // Called AFTER alert finishes dismissing (iOS 16 compatible)
            if !isShowing && userConfirmedDisconnect {
                // Alert dismissed AND user confirmed disconnect
                viewModel.disconnectWiFi()
                userConfirmedDisconnect = false  // Reset for next time
            }
        }
    }
}

/// Photo list row with metadata
struct PhotoListRow: View {
    let photo: CapturedPhoto

    var body: some View {
        HStack(spacing: 12) {
            // Left: 60x60 thumbnail
            if let image = photo.image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 60, height: 60)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 60, height: 60)
                    .cornerRadius(8)
                    .overlay(
                        ProgressView()
                    )
            }

            // Middle: Filename and metadata
            VStack(alignment: .leading, spacing: 4) {
                Text(photo.name)
                    .font(.headline)
                    .lineLimit(1)

                Text("\(formatFileSize(photo.data.count)) · \(formatRelativeTime(photo.captureDate))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Right: Download status
            if photo.isDownloading {
                ProgressView()
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.title3)
            }
        }
    }

    // MARK: - Formatters

    /// Format file size in MB/KB
    private func formatFileSize(_ bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useKB]
        formatter.countStyle = .file
        formatter.includesUnit = true
        formatter.isAdaptive = true
        return formatter.string(fromByteCount: Int64(bytes))
    }

    /// Format relative time (e.g., "just now", "2m ago", "1h ago")
    private func formatRelativeTime(_ date: Date) -> String {
        let now = Date()
        let interval = now.timeIntervalSince(date)

        if interval < 10 {
            return "just now"
        } else if interval < 60 {
            return "\(Int(interval))s ago"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
}

#Preview {
    // Preview with mock data
    NavigationView {
        LiveCaptureView(viewModel: {
            let viewModel = CameraViewModel()

            // Add mock photos with different states
            let mockPhotos = [
                CapturedPhoto(
                    name: "IMG_9876.JPG",
                    image: UIImage(systemName: "photo")!,
                    captureDate: Date().addingTimeInterval(-5)
                ),
                CapturedPhoto(
                    name: "IMG_9875.JPG",
                    image: UIImage(systemName: "photo.fill")!,
                    captureDate: Date().addingTimeInterval(-120)
                ),
                CapturedPhoto(
                    name: "IMG_9874.JPG",
                    image: UIImage(systemName: "photo")!,
                    captureDate: Date().addingTimeInterval(-3600)
                ),
                CapturedPhoto(
                    name: "IMG_9873.JPG",
                    image: UIImage(systemName: "photo.fill")!,
                    captureDate: Date().addingTimeInterval(-7200)
                )
            ]

            viewModel.capturedPhotos = mockPhotos
            viewModel.photoCount = mockPhotos.count
            viewModel.detectedPhotoCount = 5
            viewModel.eventName = "Beach Wedding 2026"
            viewModel.cameraName = "Canon EOS R5"

            return viewModel
        }())
    }
}
