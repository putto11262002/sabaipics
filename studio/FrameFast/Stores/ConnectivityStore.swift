//
//  ConnectivityStore.swift
//  FrameFast
//

import Foundation

@MainActor
final class ConnectivityStore: ObservableObject {
    @Published private(set) var state: ConnectivityState = ConnectivityState(
        status: .pending,
        pathSatisfied: false,
        apiReachable: false,
        isExpensive: false,
        isConstrained: false,
        interface: nil
    )

    var isOnline: Bool { state.isOnline }

    private let service: ConnectivityService
    private var task: Task<Void, Never>?

    init(service: ConnectivityService) {
        self.service = service
    }

    /// Forces an immediate health probe and updates state.
    /// Returns the fresh state so callers don't have to wait for the stream.
    @discardableResult
    func probeNow() async -> ConnectivityState {
        let fresh = await service.probeNow()
        state = fresh
        return fresh
    }

    func start() {
        guard task == nil else { return }
        task = Task.detached { [weak self, service] in
            let stream = await service.stream()
            for await next in stream {
                await MainActor.run {
                    self?.state = next
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
