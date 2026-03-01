//  SpoolGalleryStore.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import Foundation

@MainActor
final class SpoolGalleryStore: ObservableObject {
    enum LoadState {
        case idle
        case loading
        case loaded
    }

    @Published private(set) var photos: [SpoolFileService.Item] = []
    @Published private(set) var loadState: LoadState = .idle

    private let fileService: SpoolFileService
    private let eventId: String

    init(fileService: SpoolFileService, eventId: String) {
        self.fileService = fileService
        self.eventId = eventId
    }

    func loadPhotos() {
        loadState = .loading

        Task {
            let result = await fileService.listPhotos(eventId: eventId)
            self.photos = result
            self.loadState = .loaded
        }
    }
}
