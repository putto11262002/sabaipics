//
//  CameraDiscoveryViewModel.swift
//  SabaiPicsStudio
//
//  Shared discovery view model. Owns camera list, drives UI state,
//  delegates scanning to PTPIPScanner.
//

import Combine
import Foundation

@MainActor
final class CameraDiscoveryViewModel: ObservableObject {
    @Published private(set) var state: UIState
    @Published private(set) var cameras: [DiscoveredCamera]
    @Published var autoSelectCamera: DiscoveredCamera?
    @Published var isCleaningUp: Bool = false

    typealias UIState = DiscoveryUIState

    private let scanner: PTPIPScanner
    private let preflight: () -> CameraDiscoveryPreflightResult
    private let makeScanTargets: (_ preferredIP: String?) -> [String]
    private let scanConfig: ScanConfig
    private let autoSelect: (_ cameras: [DiscoveredCamera]) -> DiscoveredCamera?
    private let timeoutSeconds: TimeInterval

    private var timeoutTask: Task<Void, Never>?

    init(
        scanner: PTPIPScanner? = nil,
        preflight: @escaping () -> CameraDiscoveryPreflightResult = {
            WiFiNetworkInfo.currentWiFiIPv4() == nil ? .needsNetworkHelp(.notOnLocalNetwork) : .ok
        },
        makeScanTargets: @escaping (_ preferredIP: String?) -> [String],
        scanConfig: ScanConfig = .default,
        autoSelect: @escaping (_ cameras: [DiscoveredCamera]) -> DiscoveredCamera? = { _ in nil },
        timeoutSeconds: TimeInterval = 12.0
    ) {
        self.scanner = scanner ?? PTPIPScanner()
        self.preflight = preflight
        self.makeScanTargets = makeScanTargets
        self.scanConfig = scanConfig
        self.autoSelect = autoSelect
        self.timeoutSeconds = timeoutSeconds
        self.state = .scanning
        self.cameras = []

        // Wire scanner callback
        self.scanner.onCameraDiscovered = { [weak self] camera in
            guard let self else { return }
            self.cameras.append(camera)
            self.state = .found
            self.timeoutTask?.cancel()

            if let auto = self.autoSelect(self.cameras) {
                self.autoSelectCamera = auto
            }
        }
    }

    // MARK: - Public API

    func start(preferredIP: String?) async {
        autoSelectCamera = nil
        timeoutTask?.cancel()

        switch preflight() {
        case .ok:
            break
        case .needsNetworkHelp:
            state = .needsNetworkHelp
            await scanner.stop()
            return
        }

        state = .scanning
        cameras = []

        let targets = makeScanTargets(preferredIP)
        await scanner.scan(targets: targets, config: scanConfig)
        startTimeout()
    }

    func retry(preferredIP: String?) async {
        await scanner.stop()
        await start(preferredIP: preferredIP)
    }

    func stop() async {
        timeoutTask?.cancel()
        await scanner.stop()
    }

    /// Remove a camera from the managed list so cleanup won't disconnect it.
    /// Call this before handing the camera off to a parent (e.g. on select).
    func releaseCamera(_ camera: DiscoveredCamera) {
        cameras.removeAll { $0.id == camera.id }
    }

    func cleanup() async {
        timeoutTask?.cancel()
        isCleaningUp = true
        await scanner.stop()

        for camera in cameras {
            await camera.disconnect()
        }

        cameras = []
        state = .scanning
        autoSelectCamera = nil
        isCleaningUp = false
    }

    /// Best-effort cleanup with a timeout so UI never blocks forever.
    func cleanupWithTimeout(_ timeout: TimeInterval = 4.0, minOverlaySeconds: TimeInterval = 0.35) async {
        let startedAt = Date()
        isCleaningUp = true
        timeoutTask?.cancel()

        await Task.yield()

        await withTaskGroup(of: Void.self) { group in
            group.addTask { [weak self] in
                guard let self else { return }
                await self.cleanup()
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            }
            _ = await group.next()
            group.cancelAll()
        }

        // Ensure overlay doesn't flash
        let elapsed = Date().timeIntervalSince(startedAt)
        if elapsed < minOverlaySeconds {
            try? await Task.sleep(nanoseconds: UInt64((minOverlaySeconds - elapsed) * 1_000_000_000))
        }

        cameras = []
        state = .scanning
        autoSelectCamera = nil
        isCleaningUp = false
    }

    // MARK: - Private

    private func startTimeout() {
        timeoutTask?.cancel()
        timeoutTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
            if Task.isCancelled { return }
            if self.cameras.isEmpty {
                await self.scanner.stop()
                self.state = .timedOut
            }
        }
    }
}
