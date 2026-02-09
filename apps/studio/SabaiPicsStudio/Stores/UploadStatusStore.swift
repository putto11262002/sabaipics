//  UploadStatusStore.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import Foundation

@MainActor
final class UploadStatusStore: ObservableObject {
    @Published private(set) var summary: UploadManager.Summary = .init(
        queued: 0,
        presigned: 0,
        uploading: 0,
        uploaded: 0,
        awaitingCompletion: 0,
        completed: 0,
        failed: 0,
        terminalFailed: 0
    )

    @Published private(set) var stateByJobId: [String: UploadJobState] = [:]

    private let uploadManager: UploadManager
    private var task: Task<Void, Never>?

    init(uploadManager: UploadManager) {
        self.uploadManager = uploadManager
    }

    func start() {
        guard task == nil else { return }
        task = Task { [weak self] in
            await self?.loop()
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func loop() async {
        while !Task.isCancelled {
            let s = await uploadManager.summary()
            self.summary = s
            self.stateByJobId = await uploadManager.recentJobStates(limit: 500)
            try? await Task.sleep(nanoseconds: 750_000_000)
        }
    }
}
