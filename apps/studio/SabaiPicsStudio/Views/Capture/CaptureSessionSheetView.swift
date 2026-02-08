//  CaptureSessionSheetView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureSessionSheetView: View {
    let cameraName: String
    let startedAt: Date?
    let downloadsCount: Int
    let lastFilename: String?
    let recentDownloads: [CaptureSessionStore.DownloadItem]
    let captureSession: CaptureUISink?
    let isDisconnecting: Bool
    let onDisconnect: () -> Void

    @Environment(\.dismiss) private var dismiss

    private let bottomActionBarHeight: CGFloat = 72

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                sessionStats
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 12)
                    .background(Color.Theme.background)

                if let captureSession {
                    CaptureSessionPhotosView(session: captureSession)
                    .safeAreaPadding(.bottom, bottomActionBarHeight)
                } else {
                    VStack(spacing: 12) {
                        Spacer()
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 44))
                            .foregroundStyle(Color.Theme.mutedForeground)
                        Text("No live session")
                            .font(.headline)
                            .foregroundStyle(Color.Theme.foreground)
                        Text("Connect a camera to see photos here.")
                            .font(.subheadline)
                            .foregroundStyle(Color.Theme.mutedForeground)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                    .background(Color.Theme.background)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(titleStatusColor)
                            .frame(width: 10, height: 10)

                        Text(cameraName)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(Color.Theme.foreground)
                            .lineLimit(1)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(.ghost)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                bottomActions
            }
        }
        .tint(Color.Theme.primary)
    }

    private var titleStatusColor: Color {
        isDisconnecting ? Color.Theme.warning : Color.Theme.success
    }

    private var sessionStats: some View {
        HStack(spacing: 12) {
            durationCard
            statCard(title: "Downloaded", value: "\(downloadsCount)")
        }
    }

    private var durationCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Duration")
                .font(.caption)
                .foregroundStyle(Color.Theme.mutedForeground)

            TimelineView(.periodic(from: .now, by: 60)) { context in
                Text(formattedDuration(now: context.date))
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.Theme.foreground)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.Theme.border, lineWidth: 1)
        )
    }

    private func statCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Color.Theme.mutedForeground)

            Text(value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.Theme.foreground)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.Theme.border, lineWidth: 1)
        )
    }


    private var bottomActions: some View {
        HStack {
            Button {
                onDisconnect()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text(isDisconnecting ? "Disconnecting…" : "Disconnect")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(Color.Theme.destructive)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color.Theme.destructive.opacity(0.12))
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.Theme.destructive.opacity(0.35), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(isDisconnecting)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(
            Color.Theme.background
                .ignoresSafeArea()
        )
    }

    private var startedAtText: String {
        guard let startedAt else { return "—" }
        return startedAt.formatted(date: .abbreviated, time: .shortened)
    }

    private func formattedDuration(now: Date) -> String {
        guard let startedAt else { return "—" }
        let seconds = Int(now.timeIntervalSince(startedAt))
        let minutes = max(0, seconds / 60)
        if minutes < 60 {
            return "\(minutes)m"
        }
        let hours = minutes / 60
        let rem = minutes % 60
        return "\(hours)h \(rem)m"
    }
}

private struct CaptureSessionPhotosView: View {
    @ObservedObject var session: CaptureUISink

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                Section {
                    if session.photos.isEmpty {
                        emptyState
                    } else {
                        ForEach(session.photos) { photo in
                            VStack(spacing: 0) {
                                PhotoListRow(photo: photo)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)

                                Divider()
                                    .background(Color.Theme.border)
                            }
                        }
                    }
                } header: {
                    pinnedHeader
                }
            }
        }
        .background(Color.Theme.background)
        .animation(.easeOut(duration: 0.4), value: session.photos.count)
        .overlay {
            if session.isDisconnecting {
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
        }
    }

    private var pinnedHeader: some View {
        VStack(spacing: 10) {
            if session.skippedRawCount > 0 && session.showRawSkipBanner {
                rawSkipBanner
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.easeOut(duration: 0.3), value: session.skippedRawCount)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, session.skippedRawCount > 0 && session.showRawSkipBanner ? 10 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Theme.background)
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 30)
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 56))
                .foregroundStyle(Color.Theme.mutedForeground)
            VStack(spacing: 6) {
                Text("Ready to Capture")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.Theme.foreground)
                Text("Take photos with your camera.\nThey'll appear here automatically.")
                    .font(.subheadline)
                    .foregroundStyle(Color.Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            Spacer(minLength: 30)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 24)
    }

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

#if DEBUG

#Preview("Capture Session Sheet") {
    CaptureSessionSheetView(
        cameraName: "Sony A7 IV",
        startedAt: Date().addingTimeInterval(-420),
        downloadsCount: 12,
        lastFilename: "DSC01234.JPG",
        recentDownloads: [],
        captureSession: nil,
        isDisconnecting: false,
        onDisconnect: {}
    )
}

#endif
