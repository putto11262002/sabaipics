//  SpoolGalleryView.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import SwiftUI
import UIKit
import ImageIO

struct SpoolGalleryView: View {
    @StateObject private var store: SpoolGalleryStore
    @State private var selectedPhotoIndex: Int?
    @Environment(\.scenePhase) private var scenePhase

    private static let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    init(eventId: String, fileService: SpoolFileService) {
        _store = StateObject(wrappedValue: SpoolGalleryStore(fileService: fileService, eventId: eventId))
    }

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                skeletonGrid
            case .loaded where store.photos.isEmpty:
                emptyState
            case .loaded:
                photoGrid
            }
        }
        .navigationTitle("Local Photos")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            store.loadPhotos()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                store.loadPhotos()
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { selectedPhotoIndex != nil },
            set: { if !$0 { selectedPhotoIndex = nil } }
        )) {
            if let index = selectedPhotoIndex {
                SpoolPhotoViewer(photos: store.photos, initialIndex: index)
            }
        }
    }

    // MARK: - Photo Grid

    private var photoGrid: some View {
        ScrollView {
            LazyVGrid(columns: Self.columns, spacing: 2) {
                ForEach(Array(store.photos.enumerated()), id: \.element.id) { index, item in
                    SpoolPhotoCell(item: item)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedPhotoIndex = index
                        }
                }
            }
        }
    }

    // MARK: - Skeleton

    private var skeletonGrid: some View {
        ScrollView {
            LazyVGrid(columns: Self.columns, spacing: 2) {
                ForEach(0..<12, id: \.self) { _ in
                    Rectangle()
                        .fill(Color(UIColor.tertiarySystemFill))
                        .aspectRatio(1, contentMode: .fit)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 48))
                .foregroundStyle(Color.secondary)

            Text("No Local Photos")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.primary)

            Text("Photos captured for this event will appear here.")
                .font(.subheadline)
                .foregroundStyle(Color.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Full-Screen Photo Viewer

private struct SpoolPhotoViewer: View {
    let photos: [SpoolFileService.Item]
    let initialIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex: Int?
    @State private var showOverlay = true

    init(photos: [SpoolFileService.Item], initialIndex: Int) {
        self.photos = photos
        self.initialIndex = initialIndex
        _currentIndex = State(initialValue: initialIndex)
    }

    private var displayIndex: Int {
        currentIndex ?? initialIndex
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(Array(photos.enumerated()), id: \.offset) { index, item in
                        SpoolFullImage(url: item.url)
                            .containerRelativeFrame([.horizontal, .vertical])
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentIndex)
            .scrollIndicators(.hidden)
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showOverlay.toggle()
                }
            }

            if showOverlay {
                VStack {
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 32, height: 32)
                                .background(.ultraThinMaterial, in: Circle())
                        }

                        Spacer()

                        Text("\(displayIndex + 1) / \(photos.count)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    Spacer()
                }
                .transition(.opacity)
            }
        }
        .statusBarHidden(!showOverlay)
    }
}

private struct SpoolFullImage: View {
    let url: URL

    @State private var image: UIImage?

    private static let maxPixelSize: CGFloat = {
        UIScreen.main.bounds.width * UIScreen.main.scale
    }()

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                ProgressView()
                    .tint(.white)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: url) {
            image = await loadScreenImage(url: url)
        }
    }

    private func loadScreenImage(url: URL) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }

            let options: [CFString: Any] = [
                kCGImageSourceThumbnailMaxPixelSize: SpoolFullImage.maxPixelSize,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }

            return UIImage(cgImage: cgImage)
        }.value
    }
}

// MARK: - Thumbnail Cell

private struct SpoolPhotoCell: View {
    let item: SpoolFileService.Item

    @State private var thumbnail: UIImage?

    private static let thumbnailPixelSize: CGFloat = {
        ceil(UIScreen.main.bounds.width / 3) * UIScreen.main.scale
    }()

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color(UIColor.tertiarySystemFill))

            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            }
        }
        .frame(minWidth: 0, maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fill)
        .clipped()
        .task(id: item.url) {
            thumbnail = await loadThumbnail(url: item.url)
        }
    }

    private func loadThumbnail(url: URL) async -> UIImage? {
        await Task.detached(priority: .utility) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }

            let options: [CFString: Any] = [
                kCGImageSourceThumbnailMaxPixelSize: SpoolPhotoCell.thumbnailPixelSize,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }

            return UIImage(cgImage: cgImage)
        }.value
    }
}
