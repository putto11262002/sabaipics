//
//  LiveCaptureView.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//

import SwiftUI

/// View shown during active photo capture session
struct LiveCaptureView: View {
    @ObservedObject var viewModel: CameraViewModel

    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Stats header
            StatsHeader(
                photoCount: viewModel.photoCount,
                downloadingCount: viewModel.downloadingCount,
                detectedCount: viewModel.detectedPhotoCount
            )
            .padding()
            .background(Color(.systemBackground))

            Divider()

            // Photo grid
            if viewModel.capturedPhotos.isEmpty {
                EmptyStateView(detectedCount: viewModel.detectedPhotoCount)
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(viewModel.capturedPhotos) { photo in
                            PhotoThumbnailView(photo: photo)
                        }
                    }
                    .padding()
                }
            }

            Divider()

            // Action buttons
            VStack(spacing: 12) {
                // Take Photo button (BIG and prominent)
                Button(action: {
                    viewModel.takePicture()
                }) {
                    HStack {
                        Image(systemName: "camera.fill")
                            .font(.title2)
                        Text("Take Photo")
                            .font(.title3)
                            .fontWeight(.bold)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
                }

                // End Session button (smaller, secondary)
                Button(action: {
                    // TODO: End session
                }) {
                    Text("End Session")
                        .font(.subheadline)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                }
            }
            .padding()
            .background(Color(.systemBackground))
        }
    }
}

/// Stats header showing capture statistics
struct StatsHeader: View {
    let photoCount: Int
    let downloadingCount: Int
    let detectedCount: Int

    var body: some View {
        HStack(spacing: 24) {
            StatItem(icon: "bell.fill", label: "Detected", value: "\(detectedCount)")
            StatItem(icon: "camera.fill", label: "Captured", value: "\(photoCount)")
            StatItem(icon: "arrow.down.circle.fill", label: "Downloading", value: "\(downloadingCount)")

            Spacer()

            // Live indicator
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 12, height: 12)
                    .shadow(color: .green, radius: 4)

                Text("Live")
                    .font(.headline)
                    .foregroundColor(.green)
            }
        }
    }
}

/// Individual stat item
struct StatItem: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title3)
                Text(value)
                    .font(.title2)
                    .fontWeight(.bold)
            }
            .foregroundColor(.blue)

            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

/// Empty state when no photos captured yet
struct EmptyStateView: View {
    let detectedCount: Int

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "camera.aperture")
                .font(.system(size: 80))
                .foregroundColor(.gray.opacity(0.5))

            if detectedCount > 0 {
                // Show detection feedback
                Text("\(detectedCount) Photo\(detectedCount == 1 ? "" : "s") Detected")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Download starting soon...")
                    .font(.body)
                    .foregroundColor(.secondary)
            } else {
                // Original empty state
                Text("Ready to Shoot")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Take photos with camera shutter")
                    .font(.body)
                    .foregroundColor(.secondary)

                Text("Photos will appear here automatically")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
    }
}

/// Photo thumbnail in grid
struct PhotoThumbnailView: View {
    let photo: CapturedPhoto

    var body: some View {
        VStack(spacing: 4) {
            if let image = photo.image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 120)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 120)
                    .cornerRadius(8)
                    .overlay(
                        ProgressView()
                    )
            }

            Text(photo.name)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }
}

#Preview {
    // Preview with mock data
    let viewModel = CameraViewModel()
    return LiveCaptureView(viewModel: viewModel)
}
