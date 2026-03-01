//
//  ConnectivityService.swift
//  FrameFast
//
//  Single source of truth for device connectivity.
//

import Foundation
import Network

enum ConnectivityStatus: Sendable, Equatable {
    case pending    // Initial state — no signal yet
    case online     // NWPath satisfied AND health check passed
    case offline    // NWPath unsatisfied OR health check failed
}

struct ConnectivityState: Sendable, Equatable {
    enum Interface: String, Sendable {
        case wifi
        case cellular
        case wiredEthernet
        case loopback
        case other
    }

    let status: ConnectivityStatus
    let pathSatisfied: Bool
    let apiReachable: Bool
    let isExpensive: Bool
    let isConstrained: Bool
    let interface: Interface?

    /// Convenience — most consumers can keep using this
    var isOnline: Bool { status == .online }
    var isOffline: Bool { status == .offline }
}

actor ConnectivityService {
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "com.framefast.connectivity.monitor")
    private let healthURL: URL

    private var started = false
    private var state: ConnectivityState = ConnectivityState(
        status: .pending,
        pathSatisfied: false,
        apiReachable: false,
        isExpensive: false,
        isConstrained: false,
        interface: nil
    )

    private var continuations: [UUID: AsyncStream<ConnectivityState>.Continuation] = [:]
    private var reprobeTask: Task<Void, Never>?
    private var pathGeneration: UInt64 = 0

    init(healthURL: URL) {
        self.monitor = NWPathMonitor()
        self.healthURL = healthURL
    }

    deinit {
        monitor.cancel()
    }

    func start() {
        guard !started else { return }
        started = true

        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            Task { await self.handlePathUpdate(path: path) }
        }

        monitor.start(queue: queue)
    }

    func snapshot() -> ConnectivityState {
        state
    }

    /// Runs an immediate health probe and updates state. Returns the fresh state.
    func probeNow() async -> ConnectivityState {
        let reachable = await Self.probeHealth(url: healthURL)
        let newState = ConnectivityState(
            status: reachable ? .online : .offline,
            pathSatisfied: state.pathSatisfied,
            apiReachable: reachable,
            isExpensive: state.isExpensive,
            isConstrained: state.isConstrained,
            interface: state.interface
        )
        applyState(newState)
        return newState
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

    private func handlePathUpdate(path: NWPath) {
        pathGeneration += 1
        let gen = pathGeneration

        let pathSatisfied = path.status == .satisfied
        let iface = interface(for: path)
        let isExpensive = path.isExpensive
        let isConstrained = path.isConstrained

        if pathSatisfied {
            // Path is satisfied — probe the API to confirm real connectivity
            let url = healthURL
            Task {
                let reachable = await Self.probeHealth(url: url)
                // Guard against stale probe: a newer path update may have arrived
                // while probeHealth was in-flight (up to 5s).
                guard gen == self.pathGeneration else { return }
                let newState = ConnectivityState(
                    status: reachable ? .online : .offline,
                    pathSatisfied: true,
                    apiReachable: reachable,
                    isExpensive: isExpensive,
                    isConstrained: isConstrained,
                    interface: iface
                )
                self.applyState(newState)

                // Start periodic probing — fast (3s) when offline, slow (30s) when online
                self.startProbeLoop(reachable: reachable, isExpensive: isExpensive, isConstrained: isConstrained, interface: iface)
            }
        } else {
            // Path not satisfied — immediately offline, no probe needed
            stopProbeLoop()
            let newState = ConnectivityState(
                status: .offline,
                pathSatisfied: false,
                apiReachable: false,
                isExpensive: isExpensive,
                isConstrained: isConstrained,
                interface: iface
            )
            applyState(newState)
        }
    }

    private func applyState(_ newState: ConnectivityState) {
        guard newState != state else { return }
        state = newState
        for (_, c) in continuations {
            c.yield(newState)
        }
    }

    private static let offlineProbeInterval: UInt64 = 3_000_000_000   // 3s — fast recovery
    private static let onlineProbeInterval: UInt64  = 15_000_000_000  // 15s — background heartbeat

    private func startProbeLoop(reachable: Bool, isExpensive: Bool, isConstrained: Bool, interface: ConnectivityState.Interface?) {
        stopProbeLoop()
        let url = healthURL
        reprobeTask = Task { [weak self] in
            var currentlyReachable = reachable
            while !Task.isCancelled {
                let interval = currentlyReachable ? Self.onlineProbeInterval : Self.offlineProbeInterval
                try? await Task.sleep(nanoseconds: interval)
                guard !Task.isCancelled else { break }
                let probeResult = await Self.probeHealth(url: url)
                guard let self, !Task.isCancelled else { break }
                let newState = ConnectivityState(
                    status: probeResult ? .online : .offline,
                    pathSatisfied: true,
                    apiReachable: probeResult,
                    isExpensive: isExpensive,
                    isConstrained: isConstrained,
                    interface: interface
                )
                await self.applyState(newState)
                currentlyReachable = probeResult
            }
        }
    }

    private func stopProbeLoop() {
        reprobeTask?.cancel()
        reprobeTask = nil
    }

    private static func probeHealth(url: URL) async -> Bool {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200...299).contains(http.statusCode)
        } catch {
            return false
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
