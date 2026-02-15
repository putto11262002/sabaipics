//  StandardEventSource.swift
//  FrameFast
//
//  Created: 2026-01-20
//  Standard PTP event handling strategy (push events)
//
//  Used by: Fuji, Olympus, Panasonic, etc. (standard PTP event channel)
//

import Foundation

/// Standard PTP event strategy.
///
/// Consumes ObjectAdded handles from `PTPIPSession.eventObjectAddedStream()` and enqueues
/// them into the session unified photo pipeline.
@MainActor
final class StandardEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    var usesEventChannel: Bool { true }

    private weak var session: PTPIPSession?

    private var photoOps: PhotoOperationsProvider? {
        session
    }

    // Polling fallback (some cameras do not push events reliably)
    private let allowPolling: Bool
    private var pollingTask: Task<Void, Never>?
    private var eventConsumeTask: Task<Void, Never>?
    private var isMonitoring = false
    private var knownHandles = Set<UInt32>()
    private var lastEventAt = Date.distantPast
    private let pollInterval: TimeInterval = 2.0
    private let eventIdleThreshold: TimeInterval = 3.0

    init(session: PTPIPSession, allowPolling: Bool = true) {
        self.session = session
        self.allowPolling = allowPolling
    }

    func startMonitoring() async {
        guard !isMonitoring else { return }
        isMonitoring = true

        guard let session else {
            print("[StandardEventSource] No session available")
            return
        }

        let stream = session.eventObjectAddedStream()
        eventConsumeTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for await handle in stream {
                if !self.isMonitoring { break }
                self.onEventObjectAdded(handle)
            }
        }

        print("[StandardEventSource] Standard event monitoring started (push events)")
        lastEventAt = Date()

        if allowPolling {
            await initializeHandleSnapshot()
            pollingTask = Task { [weak self] in
                await self?.pollingLoop()
            }
        } else {
            print("[StandardEventSource] Polling disabled")
        }
    }

    func stopMonitoring() async {
        guard isMonitoring else { return }
        isMonitoring = false

        eventConsumeTask?.cancel()
        await eventConsumeTask?.value
        eventConsumeTask = nil

        pollingTask?.cancel()
        await pollingTask?.value
        pollingTask = nil

        print("[StandardEventSource] Standard event monitoring stopped")
    }

    func cleanup() async {
        await stopMonitoring()
        session = nil
    }

    private func onEventObjectAdded(_ objectHandle: UInt32) {
        print("[StandardEventSource] Photo detected: 0x\(String(format: "%08X", objectHandle))")
        lastEventAt = Date()

        if knownHandles.contains(objectHandle) {
            print("[StandardEventSource] Duplicate handle ignored: 0x\(String(format: "%08X", objectHandle))")
            return
        }
        knownHandles.insert(objectHandle)

        session?.enqueueObjectHandle(objectHandle)
    }
}

// MARK: - Polling fallback

private extension StandardEventSource {
    func pollingLoop() async {
        print("[StandardEventSource] Polling fallback started")

        while isMonitoring {
            do {
                try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
            } catch {
                break
            }

            if !isMonitoring { break }

            let idleDuration = Date().timeIntervalSince(lastEventAt)
            if idleDuration < eventIdleThreshold {
                continue
            }

            await pollForNewHandles()
        }

        print("[StandardEventSource] Polling fallback stopped")
    }

    func initializeHandleSnapshot() async {
        guard let photoOps = photoOps else { return }

        do {
            let storageIDs = try await photoOps.getStorageIDs()
            var snapshot = Set<UInt32>()

            for storageID in storageIDs {
                let handles = try await photoOps.getObjectHandles(storageID: storageID)
                snapshot.formUnion(handles)
            }

            knownHandles = snapshot
            print("[StandardEventSource] Baseline handles loaded: \(knownHandles.count)")
        } catch {
            print("[StandardEventSource] Failed to load baseline handles: \(error)")
        }
    }

    func pollForNewHandles() async {
        guard let photoOps = photoOps else { return }

        do {
            let storageIDs = try await photoOps.getStorageIDs()
            for storageID in storageIDs {
                let handles = try await photoOps.getObjectHandles(storageID: storageID)
                for handle in handles where !knownHandles.contains(handle) {
                    knownHandles.insert(handle)
                    print("[StandardEventSource] Poll detected new handle: 0x\(String(format: "%08X", handle))")
                    session?.enqueueObjectHandle(handle)
                }
            }
        } catch {
            print("[StandardEventSource] Polling error: \(error)")
        }
    }
}
