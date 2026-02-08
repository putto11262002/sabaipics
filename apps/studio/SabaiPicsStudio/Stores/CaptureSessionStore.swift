//  CaptureSessionStore.swift
//  SabaiPicsStudio

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
    @Published private(set) var transferSession: TransferSession? = nil
    @Published var isDetailsPresented: Bool = false

    private var disconnectTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    func start(activeCamera: ActiveCamera) {
        disconnectTask?.cancel()
        cancellables.removeAll()
        self.activeCamera = activeCamera
        self.recentDownloads = []

        // Create a live transfer session so photo feed updates in real time.
        let session = TransferSession(camera: activeCamera)
        self.transferSession = session

        self.state = .active
        self.stats = Stats(downloadsCount: session.completedDownloadsCount, lastFilename: session.lastCompletedFilename, startedAt: session.startedAt)

        session.$completedDownloadsCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                self?.stats.downloadsCount = count
            }
            .store(in: &cancellables)

        session.$lastCompletedFilename
            .receive(on: DispatchQueue.main)
            .sink { [weak self] filename in
                self?.stats.lastFilename = filename
            }
            .store(in: &cancellables)

        session.$errorMessage
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (message: String?) in
                guard let message, !message.isEmpty else { return }
                // Prefer returning to idle on unexpected disconnect.
                // (We still publish the error so it can be logged/observed.)
                self?.state = .error(message)
            }
            .store(in: &cancellables)

        session.$isActive
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (isActive: Bool) in
                guard let self else { return }
                guard isActive == false else { return }

                // TransferSession ended (user disconnect or unexpected disconnect).
                // We prefer auto-return to idle and clear the live session UI.
                self.disconnectTask?.cancel()
                self.cancellables.removeAll()
                self.transferSession = nil
                self.activeCamera = nil
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

        if let session = transferSession {
            state = .connecting
            disconnectTask = Task { [weak self] in
                await session.end()
                await MainActor.run {
                    guard let self else { return }
                    self.transferSession = nil
                    self.activeCamera = nil
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
            transferSession = nil
            return
        }

        state = .connecting
        disconnectTask = Task { [weak self] in
            await camera.disconnect()
            guard let self else { return }
            self.activeCamera = nil
            self.transferSession = nil
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
