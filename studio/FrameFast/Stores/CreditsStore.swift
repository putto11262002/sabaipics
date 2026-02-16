//
//  CreditsStore.swift
//  FrameFast
//

import Foundation

enum CreditState: Equatable {
    case pending
    case loaded(balance: Int)
    case error
}

@MainActor
final class CreditsStore: ObservableObject {
    @Published private(set) var state: CreditState = .pending

    private let apiClient: DashboardAPIClient
    private let connectivityStore: ConnectivityStore
    private var task: Task<Void, Never>?

    private static let pollInterval: UInt64 = 15_000_000_000 // 15 seconds

    init(apiClient: DashboardAPIClient, connectivityStore: ConnectivityStore) {
        self.apiClient = apiClient
        self.connectivityStore = connectivityStore
    }

    func start() {
        guard task == nil else { return }
        task = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                if !self.connectivityStore.state.isOffline {
                    do {
                        let balance = try await self.apiClient.fetchCreditBalance()
                        self.state = .loaded(balance: balance)
                    } catch {
                        if let apiError = error as? APIError, apiError.isAuthError {
                            self.state = .error
                        } else if case .loaded = self.state {
                            // Keep last known balance on transient network errors
                        } else {
                            self.state = .error
                        }
                        print("[CreditsStore] Fetch failed: \(error)")
                    }
                }
                // Skip fetch when offline -- keep last known state

                try? await Task.sleep(nanoseconds: Self.pollInterval)
            }
        }
    }

    /// Stop polling and clear auth-scoped state (used on sign-out/auth loss).
    func stop() {
        pause()
        state = .pending
    }

    /// Stop polling but preserve the current state (used for app backgrounding).
    func pause() {
        task?.cancel()
        task = nil
    }
}
