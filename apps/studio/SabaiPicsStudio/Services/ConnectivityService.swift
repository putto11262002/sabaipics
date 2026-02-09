//
//  ConnectivityService.swift
//  SabaiPicsStudio
//
//  Single source of truth for device connectivity.
//

import Foundation
import Network

struct ConnectivityState: Sendable, Equatable {
    enum Interface: String, Sendable {
        case wifi
        case cellular
        case wiredEthernet
        case loopback
        case other
    }

    let isOnline: Bool
    let isExpensive: Bool
    let isConstrained: Bool
    let interface: Interface?
}

actor ConnectivityService {
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "sabaipics.connectivity.monitor")

    private var started = false
    private var state: ConnectivityState = ConnectivityState(
        isOnline: true,
        isExpensive: false,
        isConstrained: false,
        interface: nil
    )

    private var continuations: [UUID: AsyncStream<ConnectivityState>.Continuation] = [:]

    init() {
        self.monitor = NWPathMonitor()
    }

    deinit {
        monitor.cancel()
    }

    func start() {
        guard !started else { return }
        started = true

        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            Task { await self.update(path: path) }
        }

        monitor.start(queue: queue)
    }

    func snapshot() -> ConnectivityState {
        state
    }

    func stream() -> AsyncStream<ConnectivityState> {
        start()

        let id = UUID()
        let current = state
        return AsyncStream { continuation in
            continuations[id] = continuation
            continuation.yield(current)
            continuation.onTermination = { @Sendable [weak self] _ in
                guard let self else { return }
                Task { await self.removeContinuation(id: id) }
            }
        }
    }

    // MARK: - Internals

    private func removeContinuation(id: UUID) {
        continuations[id] = nil
    }

    private func update(path: NWPath) {
        let newState = ConnectivityState(
            isOnline: path.status == .satisfied,
            isExpensive: path.isExpensive,
            isConstrained: path.isConstrained,
            interface: interface(for: path)
        )

        guard newState != state else { return }
        state = newState

        for (_, c) in continuations {
            c.yield(newState)
        }
    }

    private func interface(for path: NWPath) -> ConnectivityState.Interface? {
        if path.usesInterfaceType(.wifi) { return .wifi }
        if path.usesInterfaceType(.cellular) { return .cellular }
        if path.usesInterfaceType(.wiredEthernet) { return .wiredEthernet }
        if path.usesInterfaceType(.loopback) { return .loopback }
        // If we are online but can't map, call it other.
        if path.status == .satisfied { return .other }
        return nil
    }
}
