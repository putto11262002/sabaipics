//
//  CameraDiscoveryViewModel.swift
//  SabaiPicsStudio
//
//  Shared discovery view model driven by a strategy + discoverer.
//

import Combine
import Foundation

@MainActor
final class CameraDiscoveryViewModel<Strategy: CameraDiscoveryStrategizing & CameraDiscoveryGuidanceProviding>: ObservableObject {
    @Published private(set) var state: UIState
    @Published private(set) var cameras: [DiscoveredCamera]
    @Published var autoSelectCamera: DiscoveredCamera?
    @Published var isCleaningUp: Bool = false

    @Published private(set) var networkHelpKind: DiscoveryErrorKind?
    @Published private(set) var timedOutHint: DiscoveryErrorKind?

    private let discoverer: CameraDiscovering
    private let strategy: Strategy
    private let timeoutSeconds: TimeInterval

    private var cancellables = Set<AnyCancellable>()
    private var timeoutTask: Task<Void, Never>?
    private var lastScannerState: NetworkScannerState = .idle

    private var lastDiagnostics: DiscoveryDiagnostics?

    typealias UIState = DiscoveryUIState

    init(
        discoverer: CameraDiscovering,
        strategy: Strategy,
        timeoutSeconds: TimeInterval = 12.0,
        initialState: UIState = .scanning,
        initialCameras: [DiscoveredCamera] = []
    ) {
        self.discoverer = discoverer
        self.strategy = strategy
        self.timeoutSeconds = timeoutSeconds
        self.state = initialState
        self.cameras = initialCameras
        self.networkHelpKind = nil
        self.timedOutHint = nil

        self.discoverer.camerasPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newCameras in
                guard let self else { return }
                self.cameras = newCameras

                if !newCameras.isEmpty {
                    self.state = .found
                    self.timeoutTask?.cancel()
                } else if case .scanning = self.lastScannerState {
                    self.state = .scanning
                }

                if let auto = self.strategy.autoSelectCamera(from: newCameras) {
                    self.autoSelectCamera = auto
                }
            }
            .store(in: &cancellables)

        self.discoverer.statePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] scannerState in
                guard let self else { return }
                self.lastScannerState = scannerState
                switch scannerState {
                case .idle:
                    // Keep existing behavior: if no cameras are found, we keep showing scanning UI
                    // until either a camera appears or the UI timeout flips to .timedOut.
                    break
                case .scanning:
                    if self.cameras.isEmpty {
                        self.state = .scanning
                    }
                case .completed(let count):
                    // Important: don't override a terminal UI state (e.g. timedOut).
                    // When count==0, we intentionally keep showing "scanning" until our UI timeout
                    // flips state to ".timedOut". The timeout handler is the source of truth.
                    break
                case .error(let message):
                    self.timeoutTask?.cancel()
                    self.state = .error(.scannerError(message))
                }
            }
            .store(in: &cancellables)

        if let diagnosticsProvider = discoverer as? DiscoveryDiagnosticsProviding {
            diagnosticsProvider.diagnosticsPublisher
                .receive(on: DispatchQueue.main)
                .sink { [weak self] diagnostics in
                    self?.lastDiagnostics = diagnostics
                }
                .store(in: &cancellables)
        }
    }

    var navigationTitle: String {
        strategy.navigationTitle
    }

    var backConfirmation: AppBackConfirmation? {
        strategy.backConfirmation
    }

    var guidance: GuidanceModel? {
        strategy.guidance(for: state, networkHelpKind: networkHelpKind, timedOutHint: timedOutHint)
    }

    var primaryActionTitle: String {
        strategy.primaryActionTitle
    }

    var secondaryActionTitle: String? {
        strategy.secondaryActionTitle
    }

    func start(preferredIP: String?) {
        autoSelectCamera = nil
        timeoutTask?.cancel()
        networkHelpKind = nil
        timedOutHint = nil
        lastDiagnostics = nil

        switch strategy.preflight() {
        case .ok:
            break
        case .needsNetworkHelp(let kind):
            networkHelpKind = kind
            state = .needsNetworkHelp
            discoverer.stopScan()
            return
        }

        state = .scanning
        let plan = strategy.makeScanPlan(preferredIP: preferredIP)
        discoverer.startScan(plan: plan)
        startTimeout()
    }

    func retry(preferredIP: String?) {
        discoverer.stopScan()
        start(preferredIP: preferredIP)
    }

    func stop() {
        timeoutTask?.cancel()
        discoverer.stopScan()
    }

    func cleanup() async {
        timeoutTask?.cancel()
        isCleaningUp = true
        await discoverer.cleanup()
        state = .scanning
        cameras = []
        autoSelectCamera = nil
        networkHelpKind = nil
        timedOutHint = nil
        lastDiagnostics = nil
        isCleaningUp = false
    }

    /// Best-effort cleanup with a timeout so UI never blocks forever.
    func cleanupWithTimeout(_ timeoutSeconds: TimeInterval = 4.0, minOverlaySeconds: TimeInterval = 0.35) async {
        let startedAt = Date()
        print("[DiscoveryCleanup] start timeout=\(timeoutSeconds)s cameras=\(cameras.count) state=\(state)")

        isCleaningUp = true
        timeoutTask?.cancel()

        // Give SwiftUI a chance to render the overlay before doing heavy work.
        await Task.yield()

        var didTimeout = false
        await withTaskGroup(of: Void.self) { group in
            group.addTask { [weak self] in
                guard let self else { return }
                await self.discoverer.cleanup()
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
            }

            // Wait for the first task (cleanup or timeout)
            _ = await group.next()
            didTimeout = (Date().timeIntervalSince(startedAt) >= timeoutSeconds)
            group.cancelAll()
        }

        if didTimeout {
            print("[DiscoveryCleanup] timed out after \(String(format: "%.2f", Date().timeIntervalSince(startedAt)))s")
        } else {
            print("[DiscoveryCleanup] finished in \(String(format: "%.2f", Date().timeIntervalSince(startedAt)))s")
        }

        // Ensure the overlay doesn't flash.
        let elapsed = Date().timeIntervalSince(startedAt)
        if elapsed < minOverlaySeconds {
            let remaining = minOverlaySeconds - elapsed
            try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
        }

        // Always reset local state even if cleanup timed out.
        state = .scanning
        cameras = []
        autoSelectCamera = nil
        networkHelpKind = nil
        timedOutHint = nil
        lastDiagnostics = nil
        isCleaningUp = false
    }

    private func startTimeout() {
        timeoutTask?.cancel()
        timeoutTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
            if Task.isCancelled { return }
            if self.cameras.isEmpty {
                self.discoverer.stopScan()

                if let diagnostics = self.lastDiagnostics {
                    if diagnostics.permissionDeniedCount > 0 {
                        self.timedOutHint = .localNetworkDenied
                    } else if diagnostics.totalTargets > 0,
                              diagnostics.portClosedCount == diagnostics.totalTargets {
                        // Best-effort: looks like the PTP/IP port is refusing connections on all targets.
                        self.timedOutHint = .unknown("ptpipPortClosed")
                    } else if diagnostics.totalTargets > 0,
                              (diagnostics.networkUnreachableCount + diagnostics.hostUnreachableCount) == diagnostics.totalTargets {
                        self.timedOutHint = .notOnLocalNetwork
                    }
                }
                self.state = .timedOut
            }
        }
    }
}
