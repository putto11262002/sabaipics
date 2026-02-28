//  CaptureSessionSheetView.swift
//  FrameFast

import SwiftUI

struct CaptureSessionSheetView: View {
    let cameraName: String
    let eventName: String?
    let startedAt: Date?
    let downloadsCount: Int
    let syncedCount: Int
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
                sessionInfoList
                    .padding(.top, 8)

                if let captureSession {
                    CaptureSessionPhotosView(session: captureSession)
                    .safeAreaPadding(.bottom, bottomActionBarHeight)
                } else {
                    VStack(spacing: 12) {
                        Spacer()
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 44))
                            .foregroundStyle(Color.secondary)
                        Text("No live session")
                            .font(.headline)
                            .foregroundStyle(Color.primary)
                        Text("Connect a camera to see photos here.")
                            .font(.subheadline)
                            .foregroundStyle(Color.secondary)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                    .buttonStyle(.plain)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                bottomActions
            }
        }
        .tint(Color.accentColor)
    }

    private var sessionInfoList: some View {
        VStack(spacing: 0) {
            sessionInfoRow(
                icon: "calendar",
                label: "Event",
                value: eventName ?? "No event selected"
            )

            Divider().padding(.leading, 44)

            sessionInfoRow(
                icon: "camera",
                label: "Camera",
                value: cameraName
            )

            Divider().padding(.leading, 44)

            sessionInfoRow(
                icon: "arrow.down.circle",
                label: "Downloaded",
                value: "\(downloadsCount)"
            )

            Divider().padding(.leading, 44)

            sessionInfoRow(
                icon: "checkmark.icloud",
                label: "Synced",
                value: "\(syncedCount)"
            )
        }
        .background(Color(uiColor: .systemGroupedBackground))
    }

    private func sessionInfoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundStyle(Color.secondary)
                .frame(width: 20)

            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color.secondary)

            Spacer()

            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private var bottomActions: some View {
        Button {
            onDisconnect()
        } label: {
            Text(isDisconnecting ? "Disconnecting…" : "Disconnect")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isDisconnecting)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()
        )
    }

}

private struct CaptureSessionPhotosView: View {
    @ObservedObject var session: CaptureUISink
    @EnvironmentObject private var uploadStatusStore: UploadStatusStore

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                Section {
                    if session.photos.isEmpty {
                        emptyState
                    } else {
                        ForEach(session.photos) { photo in
                            VStack(spacing: 0) {
                                PhotoListRow(photo: photo, uploadState: photo.uploadJobId.flatMap { uploadStatusStore.stateByJobId[$0] })
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)

                                Divider()
                                    .background(Color(UIColor.separator))
                            }
                        }
                    }
                } header: {
                    pinnedHeader
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemGroupedBackground))
        .animation(.easeOut(duration: 0.4), value: session.photos.count)
        .overlay {
            if session.isDisconnecting {
                ZStack {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView()
                        .scaleEffect(1.2)
                        .padding(20)
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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
        .background(Color(uiColor: .systemGroupedBackground))
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 30)
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 56))
                .foregroundStyle(Color.secondary)
            VStack(spacing: 6) {
                Text("Ready to Capture")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.primary)
                Text("Take photos with your camera.\nThey'll appear here automatically.")
                    .font(.subheadline)
                    .foregroundStyle(Color.secondary)
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
                .foregroundColor(Color.primary)

            Spacer()

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    session.showRawSkipBanner = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundColor(Color.secondary)
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
    struct SheetPreview: View {
        @State private var isPresented = true

        var body: some View {
            let sink = CaptureUISink(startedAt: Date().addingTimeInterval(-420))
            let photos = Self.mockPhotos()
            let uploadStore = UploadStatusStore(mockStateByJobId: Self.mockJobStates())

            let _ = {
                sink.photos = photos
                sink.completedDownloadsCount = photos.filter {
                    if case .completed = $0.status { return true }
                    return false
                }.count
            }()

            Color(.systemBackground)
                .ignoresSafeArea()
                .sheet(isPresented: $isPresented) {
                    CaptureSessionSheetView(
                        cameraName: "Sony A7 IV",
                        eventName: "Bangkok Wedding",
                        startedAt: Date().addingTimeInterval(-420),
                        downloadsCount: sink.completedDownloadsCount,
                        syncedCount: 2,
                        lastFilename: "DSC01234.JPG",
                        recentDownloads: [],
                        captureSession: sink,
                        isDisconnecting: false,
                        onDisconnect: {}
                    )
                    .environmentObject(uploadStore)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                }
        }

        static func mockPhotos() -> [CapturedPhoto] {
            // 1. Downloading (placeholder)
            let downloading = CapturedPhoto(
                id: "00000001",
                name: "DSC01240.JPG",
                captureDate: Date().addingTimeInterval(-10),
                fileSize: 8_500_000,
                isDownloading: true
            )

            // 2. Downloaded, queued for upload
            let queued = CapturedPhoto(
                id: "00000002",
                name: "DSC01239.JPG",
                captureDate: Date().addingTimeInterval(-30),
                fileSize: 7_200_000,
                isDownloading: false
            )
            queued.status = .completed
            queued.uploadJobId = "job-queued"

            // 3. Uploading
            let uploading = CapturedPhoto(
                id: "00000003",
                name: "DSC01238.JPG",
                captureDate: Date().addingTimeInterval(-60),
                fileSize: 6_800_000,
                isDownloading: false
            )
            uploading.status = .completed
            uploading.uploadJobId = "job-uploading"

            // 4. Awaiting completion (server processing)
            let awaiting = CapturedPhoto(
                id: "00000004",
                name: "DSC01237.JPG",
                captureDate: Date().addingTimeInterval(-120),
                fileSize: 9_100_000,
                isDownloading: false
            )
            awaiting.status = .completed
            awaiting.uploadJobId = "job-awaiting"

            // 5. Fully synced
            let synced = CapturedPhoto(
                id: "00000005",
                name: "DSC01236.JPG",
                captureDate: Date().addingTimeInterval(-180),
                fileSize: 5_400_000,
                isDownloading: false
            )
            synced.status = .completed
            synced.uploadJobId = "job-completed"

            // 6. Upload failed (retryable)
            let failed = CapturedPhoto(
                id: "00000006",
                name: "DSC01235.JPG",
                captureDate: Date().addingTimeInterval(-240),
                fileSize: 7_000_000,
                isDownloading: false
            )
            failed.status = .completed
            failed.uploadJobId = "job-failed"

            // 7. Terminal failure
            let terminal = CapturedPhoto(
                id: "00000007",
                name: "DSC01234.JPG",
                captureDate: Date().addingTimeInterval(-300),
                fileSize: 8_000_000,
                isDownloading: false
            )
            terminal.status = .completed
            terminal.uploadJobId = "job-terminal"

            // 8. Download failed
            let dlFailed = CapturedPhoto(
                id: "00000008",
                name: "DSC01233.JPG",
                captureDate: Date().addingTimeInterval(-360),
                fileSize: 6_500_000,
                isDownloading: false
            )
            dlFailed.status = .failed(NSError(domain: "preview", code: 0))

            return [downloading, queued, uploading, awaiting, synced, failed, terminal, dlFailed]
        }

        static func mockJobStates() -> [String: UploadJobState] {
            [
                "job-queued": .queued,
                "job-uploading": .uploading,
                "job-awaiting": .awaitingCompletion,
                "job-completed": .completed,
                "job-failed": .failed,
                "job-terminal": .terminalFailed,
            ]
        }
    }

    return SheetPreview()
}

#endif
