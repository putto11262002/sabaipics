//  StorageSummaryStore.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import Foundation

@MainActor
final class StorageSummaryStore: ObservableObject {
    enum CleanupTarget {
        case completed
        case failed
    }

    @Published private(set) var summary: StorageSummary?
    @Published private(set) var diskUsage: Int64 = 0
    @Published private(set) var isLoading = false
    @Published private(set) var activeCleanup: CleanupTarget?

    private let store: UploadQueueStore
    private let fileService: SpoolFileService
    private let coordinator: AppCoordinator

    init(store: UploadQueueStore, fileService: SpoolFileService, coordinator: AppCoordinator) {
        self.store = store
        self.fileService = fileService
        self.coordinator = coordinator
    }

    func refresh() {
        isLoading = true

        Task {
            let summaryResult = try? await store.fetchStorageSummary()
            let diskBytes = await fileService.diskUsage()

            self.summary = summaryResult
            self.diskUsage = diskBytes
            self.isLoading = false
        }
    }

    func clearCompleted() {
        activeCleanup = .completed

        Task {
            await coordinator.forceCleanupCompleted()
            activeCleanup = nil
            refresh()
        }
    }

    func clearFailed() {
        activeCleanup = .failed

        Task {
            await coordinator.forceCleanupFailed()
            activeCleanup = nil
            refresh()
        }
    }
}
