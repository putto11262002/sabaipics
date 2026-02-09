//  CaptureSessionStore.swift
//  FrameFast

import Foundation
import Combine

@MainActor
final class CaptureSessionStore: ObservableObject {
    enum State: Equatable {
        case idle
        case connecting
        case active
        case error(String)
    }

    struct Stats: Equatable {
        var downloadsCount: Int = 0
        var lastFilename: String? = nil
        var startedAt: Date? = nil
    }

    struct DownloadItem: Identifiable, Equatable {
        let id: UUID = UUID()
        let filename: String
        let at: Date
    }

    enum Event: Equatable {
        case downloadCompleted(filename: String)
        case error(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var activeCamera: ActiveCamera? = nil
    @Published private(set) var stats: Stats = Stats()
    @Published private(set) var recentDownloads: [DownloadItem] = []
    @Published private(set) var captureSession: CaptureUISink? = nil
    @Published var isDetailsPresented: Bool = false

    private var disconnectTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private var controller: CaptureSessionController?

    private var uploadManager: UploadManager?
    private var eventIdProvider: (() async -> String?)?

    func configure(uploadManager: UploadManager, eventIdProvider: @escaping () async -> String?) {
        self.uploadManager = uploadManager
        self.eventIdProvider = eventIdProvider
    }

    func start(activeCamera: ActiveCamera) {
        disconnectTask?.cancel()
        cancellables.removeAll()
        self.activeCamera = activeCamera
        self.recentDownloads = []

        controller = CaptureSessionController(activeCamera: activeCamera) { ui in
            var sinks: [AnyCaptureEventSink] = []
            if let uploadManager, let eventIdProvider {
                sinks.append(
                    UploadQueueSink(
                        uploadManager: uploadManager,
                        eventIdProvider: eventIdProvider,
                        onEnqueued: { objectHandle, jobId in
                            await MainActor.run {
                                ui.linkUploadJob(objectHandle: objectHandle, jobId: jobId)
                            }
                        }
                    ).asSink()
                )
            }
            return sinks
        }
        let ui = controller!.ui

        self.captureSession = ui

        self.state = .active
        self.stats = Stats(downloadsCount: ui.completedDownloadsCount, lastFilename: ui.lastCompletedFilename, startedAt: ui.startedAt)

        ui.$completedDownloadsCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                self?.stats.downloadsCount = count
            }
            .store(in: &cancellables)

        ui.$lastCompletedFilename
            .receive(on: DispatchQueue.main)
            .sink { [weak self] filename in
                self?.stats.lastFilename = filename
            }
            .store(in: &cancellables)

        ui.$errorMessage
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (message: String?) in
                guard let message, !message.isEmpty else { return }
                // Prefer returning to idle on unexpected disconnect.
                // (We still publish the error so it can be logged/observed.)
                self?.state = .error(message)
            }
            .store(in: &cancellables)

        ui.$isActive
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (isActive: Bool) in
                guard let self else { return }
                guard isActive == false else { return }

                // Capture session ended (user disconnect or unexpected disconnect).
                // We prefer auto-return to idle and clear the live session UI.
                self.disconnectTask?.cancel()
                self.cancellables.removeAll()
                self.captureSession = nil
                self.activeCamera = nil
                self.controller = nil
                self.state = .idle
                self.isDetailsPresented = false
                self.stats = Stats()
                self.recentDownloads = []
            }
            .store(in: &cancellables)
    }

    func disconnect() {
        disconnectTask?.cancel()
        cancellables.removeAll()

        if let controller {
            state = .connecting
            disconnectTask = Task { [weak self] in
                await controller.end()
                await MainActor.run {
                    guard let self else { return }
                    self.captureSession = nil
                    self.activeCamera = nil
                    self.controller = nil
                    self.state = .idle
                    self.isDetailsPresented = false
                    self.stats = Stats()
                    self.recentDownloads = []
                }
            }
            return
        }

        guard let camera = activeCamera else {
            state = .idle
            isDetailsPresented = false
            stats = Stats()
            recentDownloads = []
            captureSession = nil
            controller = nil
            return
        }

        state = .connecting
        disconnectTask = Task { [weak self] in
            await camera.disconnect()
            guard let self else { return }
            self.activeCamera = nil
            self.captureSession = nil
            self.controller = nil
            self.state = .idle
            self.isDetailsPresented = false
            self.stats = Stats()
            self.recentDownloads = []
        }
    }

    func handle(event: Event) {
        switch event {
        case .downloadCompleted(let filename):
            stats.downloadsCount += 1
            stats.lastFilename = filename
            recentDownloads.insert(DownloadItem(filename: filename, at: Date()), at: 0)
            if recentDownloads.count > 50 {
                recentDownloads.removeLast(recentDownloads.count - 50)
            }
        case .error(let message):
            state = .error(message)
        }
    }
}
