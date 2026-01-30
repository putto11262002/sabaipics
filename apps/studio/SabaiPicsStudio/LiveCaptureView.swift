//
//  LiveCaptureView.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//  Updated: 2026-01-19 - Transfer Session Architecture
//  Updated: 2026-01-20 - Direct observation fix for photo updates
//  Option 4: Navigation Bar + Photo Count (hybrid approach)
//

import SwiftUI

/// View shown during active photo transfer session
/// Uses direct @ObservedObject observation of TransferSession for proper photo updates
struct LiveCaptureView: View {
    /// Direct observation of session - FIXES photo update bug
    /// When session.photos changes, view re-renders immediately
    @ObservedObject var session: TransferSession

    /// Callback for navigation after disconnect (navigation only, not business logic)
    let onDisconnected: () -> Void

    /// Capture flow coordinator for cleanup registration
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator

    var body: some View {
        VStack(spacing: 0.0) {
            Divider()
                .background(Color.Theme.border)

            // RAW file skip warning banner
            if session.skippedRawCount > 0 && session.showRawSkipBanner {
                rawSkipBanner
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.easeOut(duration: 0.3), value: session.skippedRawCount)
            }

            if session.photos.isEmpty {
                // Empty state
                emptyStateView
            } else {
                // Photo list - uses session.photos directly for proper observation
                List {
                    ForEach(session.photos) { photo in
                        PhotoListRow(photo: photo)
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                            .transition(.asymmetric(
                                insertion: .move(edge: .top).combined(with: .opacity),
                                removal: .opacity
                            ))
                    }
                }
                .listStyle(.plain)
                .animation(.easeOut(duration: 0.4), value: session.photos.count)
            }
        }
        .toolbar(content: toolbarContent)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: session.photos.count) { newCount in
            print("[LiveCaptureView] \u{1F4F8} Photo count changed to: \(newCount)")
        }
        .onAppear {
            captureFlow.registerCleanup { [weak session] in
                await session?.end()
            }
        }
        .onDisappear {
            captureFlow.unregisterCleanup()
        }
        .overlay {
            if session.isDisconnecting {
                disconnectingOverlay
            }
        }
    }

    // MARK: - Disconnecting Overlay

    /// Overlay shown while disconnecting (waiting for in-progress downloads)
    private var disconnectingOverlay: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.2)
                    .tint(Color.white)

                Text("Disconnecting...")
                    .font(.headline)
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.black.opacity(0.8))
            )
        }
    }

    // MARK: - Toolbar Content

    @ToolbarContentBuilder
    private func toolbarContent() -> some ToolbarContent {
        // Principal: Camera name only
        ToolbarItem(placement: .principal) {
            Text(session.cameraName)
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)
        }
    }

    // MARK: - Empty State

    /// Empty state view when no photos captured yet
    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "camera.viewfinder")
                .font(.system(size: 60))
                .foregroundColor(Color.Theme.mutedForeground)

            VStack(spacing: 8) {
                Text("Ready to Capture")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(Color.Theme.foreground)

                Text("Take photos with your camera.\nThey'll appear here automatically.")
                    .font(.body)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - RAW Skip Banner

    /// Dismissible warning banner shown when RAW files are skipped
    private var rawSkipBanner: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
                .font(.subheadline)

            Text("\(session.skippedRawCount) RAW file\(session.skippedRawCount == 1 ? "" : "s") skipped")
                .font(.subheadline)
                .foregroundColor(Color.Theme.foreground)

            Spacer()

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    session.showRawSkipBanner = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundColor(Color.Theme.mutedForeground)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.orange.opacity(0.15))
    }
}

/// Photo list row with metadata
struct PhotoListRow: View {
    @ObservedObject var photo: CapturedPhoto

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
                    .fill(Color.Theme.muted)
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
                    .foregroundColor(Color.Theme.foreground)
                    .lineLimit(1)

                // Show file size from metadata (available immediately)
                // or actual data size after download completes
                let displaySize = photo.data.isEmpty ? photo.fileSize : photo.data.count
                Text("\(formatFileSize(displaySize)) · \(formatRelativeTime(photo.captureDate))")
                    .font(.caption)
                    .foregroundColor(Color.Theme.mutedForeground)
            }

            Spacer()

            // Right: Download status with enhanced states
            downloadStatusView
        }
    }

    /// Download status indicator
    @ViewBuilder
    private var downloadStatusView: some View {
        switch photo.status {
        case .downloading:
            ProgressView()
                .scaleEffect(0.8)

        case .completed:
            Image(systemName: "arrow.down.circle.fill")
                .foregroundColor(Color.Theme.primary)
                .font(.title3)

        case .failed(let error):
            VStack(alignment: .trailing, spacing: 2) {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundColor(Color.Theme.destructive)
                    .font(.title3)
                Text("Failed")
                    .font(.caption2)
                    .foregroundColor(Color.Theme.destructive)
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
