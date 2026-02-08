//  SonyEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//  Sony-specific event handling strategy
//

import Foundation

/// Sony PTP/IP event strategy.
///
/// Sony cameras can emit the special in-memory object handle `0xFFFFC001`.
/// We gate downloads until the camera reports the in-memory object is safe to read,
/// and we synthesize a stable logical handle per capture for UI tracking.
@MainActor
final class SonyEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    var usesEventChannel: Bool { true }

    private weak var session: PTPIPSession?

    private var photoOps: PhotoOperationsProvider? {
        session
    }

    private var eventConsumeTask: Task<Void, Never>?
    private var isMonitoring = false
    private var knownHandles = Set<UInt32>()

    // Sony in-memory capture handle (observed on ILCE bodies)
    private let sonyInMemoryHandle: UInt32 = 0xFFFFC001
    private var lastSonyInMemorySignature: (filename: String, sequenceNumber: UInt32, size: UInt32)?
    private var sonyInMemoryLogicalCounter: UInt32 = 0

    // Queue triggers since Sony can burst ObjectAdded for the same handle.
    private var sonyInMemoryPendingTriggers: Int = 0
    private var sonyInMemoryProcessor: Task<Void, Never>?

    init(session: PTPIPSession) {
        self.session = session
    }

    func startMonitoring() async {
        guard !isMonitoring else { return }
        isMonitoring = true

        guard let session else {
            print("[SonyEventSource] No session available")
            return
        }

        let stream = session.eventObjectAddedStream()
        eventConsumeTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for await handle in stream {
                if !self.isMonitoring { break }
                await self.onEventObjectAdded(handle)
            }
        }

        print("[SonyEventSource] Sony event monitoring started (push events)")
    }

    func stopMonitoring() async {
        guard isMonitoring else { return }
        isMonitoring = false

        eventConsumeTask?.cancel()
        await eventConsumeTask?.value
        eventConsumeTask = nil

        sonyInMemoryProcessor?.cancel()
        await sonyInMemoryProcessor?.value
        sonyInMemoryProcessor = nil

        print("[SonyEventSource] Sony event monitoring stopped")
    }

    func cleanup() async {
        await stopMonitoring()
        session = nil
        knownHandles.removeAll()
        sonyInMemoryPendingTriggers = 0
        lastSonyInMemorySignature = nil
    }

    private func onEventObjectAdded(_ objectHandle: UInt32) async {
        print("[SonyEventSource] Photo detected: 0x\(String(format: "%08X", objectHandle))")

        if objectHandle == sonyInMemoryHandle {
            enqueueSonyInMemoryTrigger(source: "event")
            return
        }

        if knownHandles.contains(objectHandle) {
            print("[SonyEventSource] Duplicate handle ignored: 0x\(String(format: "%08X", objectHandle))")
            return
        }
        knownHandles.insert(objectHandle)

        await handleSonyObjectAdded(objectHandle, source: "event")
    }
}

// MARK: - Sony normal handles

private extension SonyEventSource {
    func handleSonyObjectAdded(_ objectHandle: UInt32, source: String) async {
        guard let photoOps, let session else { return }

        do {
            let objectInfo = try await photoOps.getObjectInfo(objectHandle: objectHandle)

            // Preserve Sony behavior: download using maxBytes (partial transfer) and reuse ObjectInfo.
            session.enqueueDetectedPhoto(
                logicalHandle: objectHandle,
                downloadHandle: objectHandle,
                objectInfo: objectInfo,
                maxBytes: objectInfo.objectCompressedSize
            )
        } catch {
            print("[SonyEventSource] GetObjectInfo failed (\(source)): \(error)")
            delegate?.eventSource(self, didFailWithError: error)
        }
    }
}

// MARK: - Sony in-memory capture queue

private extension SonyEventSource {
    func enqueueSonyInMemoryTrigger(source: String) {
        sonyInMemoryPendingTriggers += 1
        print("[SonyEventSource] Sony in-memory trigger queued (\(source)), pending=\(sonyInMemoryPendingTriggers)")

        if sonyInMemoryProcessor != nil {
            return
        }

        sonyInMemoryProcessor = Task { [weak self] in
            await self?.processSonyInMemoryQueue()
        }
    }

    func processSonyInMemoryQueue() async {
        defer {
            sonyInMemoryProcessor = nil
        }

        while isMonitoring && sonyInMemoryPendingTriggers > 0 {
            sonyInMemoryPendingTriggers -= 1
            await processSingleSonyInMemoryCapture()
        }
    }

    func processSingleSonyInMemoryCapture() async {
        guard let session, let photoOps else { return }

        let ready = await waitForSonyObjectInMemoryReady(session)
        guard ready else {
            print("[SonyEventSource] Sony objectInMemory gate not satisfied; skipping trigger")
            return
        }

        // Sony sends bursts of ObjectAdded events for the same in-memory handle.
        // We need to wait until ObjectInfo changes (filename/size) before treating it as a new capture.
        let maxAttempts = 20
        let delayNs: UInt64 = 150_000_000 // 150ms

        var objectInfo: PTPObjectInfo?
        for attempt in 1...maxAttempts {
            do {
                let info = try await photoOps.getObjectInfo(objectHandle: sonyInMemoryHandle)
                let signature = (filename: info.filename, sequenceNumber: info.sequenceNumber, size: info.objectCompressedSize)
                if let last = lastSonyInMemorySignature,
                   last.filename == signature.filename,
                   last.sequenceNumber == signature.sequenceNumber,
                   last.size == signature.size {
                    if attempt < maxAttempts {
                        try? await Task.sleep(nanoseconds: delayNs)
                        continue
                    }
                }

                objectInfo = info
                break
            } catch {
                if attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: delayNs)
                    continue
                }
                print("[SonyEventSource] Sony in-memory GetObjectInfo failed after \(maxAttempts) attempts: \(error)")
                return
            }
        }

        guard let info = objectInfo else { return }

        lastSonyInMemorySignature = (filename: info.filename, sequenceNumber: info.sequenceNumber, size: info.objectCompressedSize)

        sonyInMemoryLogicalCounter &+= 1
        let logicalHandle: UInt32 = 0xFE000000 | (sonyInMemoryLogicalCounter & 0x00FFFFFF)

        print("[SonyEventSource] Sony in-memory capture: downloadHandle=0x\(String(format: "%08X", sonyInMemoryHandle)) logicalHandle=0x\(String(format: "%08X", logicalHandle)) filename=\(info.filename) size=\(info.objectCompressedSize)")

        session.enqueueDetectedPhoto(
            logicalHandle: logicalHandle,
            downloadHandle: sonyInMemoryHandle,
            objectInfo: info,
            maxBytes: info.objectCompressedSize
        )
    }

    func waitForSonyObjectInMemoryReady(_ session: PTPIPSession) async -> Bool {
        let deadline = Date().addingTimeInterval(35.0)
        let delayNs: UInt64 = 200_000_000 // 200ms

        var lastLoggedValue: UInt16?
        var attempt = 0

        while isMonitoring && Date() < deadline {
            attempt += 1
            do {
                if let value = try await session.getSonyObjectInMemoryValue() {
                    if value != lastLoggedValue {
                        print("[SonyEventSource] Sony objectInMemory=0x\(String(format: "%04X", value)) (attempt \(attempt))")
                        lastLoggedValue = value
                    }
                    // Rocc/libgphoto2: only safe when >= 0x8000; value can become 1 and downloading then can crash firmware.
                    if value >= 0x8000 {
                        return true
                    }
                }
            } catch {
                // Ignore transient failures and retry.
            }

            try? await Task.sleep(nanoseconds: delayNs)
        }

        return false
    }
}
