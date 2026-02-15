//  UploadStatusStore.swift
//  FrameFast
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

    private let uploadManager: UploadManager?
    private var task: Task<Void, Never>?

    init(uploadManager: UploadManager) {
        self.uploadManager = uploadManager
    }

    #if DEBUG
    /// Preview-only init with pre-populated job states.
    init(mockStateByJobId: [String: UploadJobState]) {
        self.uploadManager = nil
        self.stateByJobId = mockStateByJobId
    }
    #endif

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
        guard let uploadManager else { return }
        while !Task.isCancelled {
            let s = await uploadManager.summary()
            self.summary = s
            self.stateByJobId = await uploadManager.recentJobStates(limit: 500)
            try? await Task.sleep(nanoseconds: 750_000_000)
        }
    }
}
