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

    /// Local alert state - no cleanup needed, dies with view
    @State private var showDisconnectAlert = false

    /// Event name for display (placeholder for now)
    private var eventName: String {
        "Photo Session"
    }

    var body: some View {
        VStack(spacing: 0.0) {
            Divider()
                .background(Color(UIColor.separator))

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
        .toolbarBackground(Color(UIColor.systemBackground), for: .navigationBar)
        .alert("Disconnect from camera?", isPresented: $showDisconnectAlert) {
            Button("Cancel", role: .cancel) {
                print("[LiveCaptureView] \u{1F50C} Disconnect cancelled")
            }
            Button("Disconnect", role: .destructive) {
                print("[LiveCaptureView] \u{1F50C} Disconnect confirmed")
                Task {
                    await session.end()
                    print("[LiveCaptureView] \u{1F50C} Session ended, calling onDisconnected")
                    onDisconnected()
                }
            }
        } message: {
            Text("Photos will be cleared. Make sure you've saved what you need.")
        }
        .onChange(of: session.photos.count) { newCount in
            print("[LiveCaptureView] \u{1F4F8} Photo count changed to: \(newCount)")
        }
    }

    // MARK: - Toolbar Content

    @ToolbarContentBuilder
    private func toolbarContent() -> some ToolbarContent {
        // Principal: Event name + camera name with status
        ToolbarItem(placement: .principal) {
            VStack(spacing: 2) {
                Text(eventName)
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Circle()
                        .fill(session.isCameraConnected ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(session.cameraName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }

        // Trailing: Disconnect button
        ToolbarItem(placement: .navigationBarTrailing) {
            Button(action: {
                print("[LiveCaptureView] \u{1F50C} Disconnect button tapped")
                showDisconnectAlert = true
            }) {
                Text("Disconnect")
                    .foregroundColor(.red)
            }
        }
    }

    // MARK: - Empty State

    /// Empty state view when no photos captured yet
    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "camera.viewfinder")
                .font(.system(size: 60))
                .foregroundColor(.secondary)

            VStack(spacing: 8) {
                Text("Ready to Capture")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Take photos with your camera.\nThey'll appear here automatically.")
                    .font(.body)
                    .foregroundColor(.secondary)
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
                .foregroundColor(.primary)

            Spacer()

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    session.showRawSkipBanner = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .background(Color.orange.opacity(0.15))
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

// Preview requires a mock session - skip for now since TransferSession requires ActiveCamera
// #Preview {
//     NavigationView {
//         LiveCaptureView(session: ...) {
//             print("Disconnected")
//         }
//     }
// }
