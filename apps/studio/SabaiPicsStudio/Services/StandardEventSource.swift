//
//  StandardEventSource.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-20
//  Standard PTP event channel implementation (push events)
//  Wraps PTPIPEventMonitor for use with CameraEventSource protocol
//
//  Used by: Sony, Fuji, Olympus, Panasonic, and other cameras that use
//  standard PTP event channel (not vendor-specific polling)
//
//  TODO: Validate with actual Sony camera - standard PTP event format
//  TODO: Verify ObjectAdded event parameters match expected format
//  TODO: Test connection stability with long-running sessions
//

import Foundation
import Network

// MARK: - Standard Event Source

/// Standard PTP event channel implementation
/// Wraps PTPIPEventMonitor for cameras that push events (not poll)
/// Used for Sony, Fuji, Olympus, Panasonic, etc.
@MainActor
class StandardEventSource: CameraEventSource {
    weak var delegate: CameraEventSourceDelegate?

    // Internal monitor (existing implementation)
    private let eventMonitor: PTPIPEventMonitor
    private weak var eventConnection: NWConnection?
    private weak var photoOps: PhotoOperationsProvider?

     // For Sony PTP/IP, storage enumeration can remain unavailable (StoreNotAvailable).
     // In that mode we rely on event-driven object IDs instead of polling storages.
     private let allowPolling: Bool

    // Polling fallback (Sony: some cameras do not push events reliably)
    private var pollingTask: Task<Void, Never>?
    private var isMonitoring = false
    private var knownHandles = Set<UInt32>()
    private var lastEventAt = Date.distantPast
    private let pollInterval: TimeInterval = 2.0
    private let eventIdleThreshold: TimeInterval = 3.0

    // Sony in-memory capture handle (observed on ILCE bodies)
    private let sonyInMemoryHandle: UInt32 = 0xFFFFC001
    private var lastSonyInMemorySignature: (filename: String, sequenceNumber: UInt32, size: UInt32)?
    private var sonyInMemoryLogicalCounter: UInt32 = 0
    private var sonyInMemoryPendingTriggers: Int = 0
    private var sonyInMemoryProcessor: Task<Void, Never>?

    /// Initialize standard event source
    /// - Parameters:
    ///   - eventConnection: Event channel connection
    ///   - photoOps: Provider for photo operations (getObjectInfo, downloadPhoto)
    init(eventConnection: NWConnection?, photoOps: PhotoOperationsProvider?, allowPolling: Bool = true) {
        self.eventMonitor = PTPIPEventMonitor()
        self.eventConnection = eventConnection
        self.photoOps = photoOps
        self.allowPolling = allowPolling
    }

    // MARK: - CameraEventSource Protocol

    func startMonitoring() async {
        guard !isMonitoring else { return }
        isMonitoring = true

        guard let connection = eventConnection else {
            print("[StandardEventSource] No event connection available")
            return
        }

        // Set ourselves as the monitor's delegate to bridge callbacks
        await eventMonitor.setDelegate(self)
        await eventMonitor.startMonitoring(connection: connection)
        print("[StandardEventSource] Standard event monitoring started (push events)")

        lastEventAt = Date()

        if allowPolling {
            // Snapshot existing handles to avoid downloading old photos
            await initializeHandleSnapshot()

            pollingTask = Task { [weak self] in
                await self?.pollingLoop()
            }
        } else {
            print("[StandardEventSource] Polling disabled (Sony mode)")
        }
    }

    func stopMonitoring() async {
        guard isMonitoring else { return }
        isMonitoring = false

        pollingTask?.cancel()
        await pollingTask?.value
        pollingTask = nil

        await eventMonitor.stopMonitoring()
        print("[StandardEventSource] Standard event monitoring stopped")
    }

    func cleanup() async {
        await stopMonitoring()
        await eventMonitor.cleanup()
        eventConnection = nil
        photoOps = nil
    }
}

// MARK: - PTPIPEventMonitorDelegate

/// Bridge from PTPIPEventMonitor callbacks to CameraEventSourceDelegate
extension StandardEventSource: PTPIPEventMonitorDelegate {
    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didReceiveObjectAdded objectHandle: UInt32) {
        Task { @MainActor in
            print("[StandardEventSource] Photo detected: 0x\(String(format: "%08X", objectHandle))")

            lastEventAt = Date()

            if objectHandle == sonyInMemoryHandle {
                enqueueSonyInMemoryTrigger(source: "event")
                return
            }

            if knownHandles.contains(objectHandle) {
                print("[StandardEventSource] Duplicate handle ignored: 0x\(String(format: "%08X", objectHandle))")
                return
            }
            knownHandles.insert(objectHandle)

            await handleObjectAdded(objectHandle, source: "event")
        }
    }

    nonisolated func eventMonitor(_ monitor: PTPIPEventMonitor, didFailWithError error: Error) {
        Task { @MainActor in
            print("[StandardEventSource] Event monitor error: \(error)")
            delegate?.eventSource(self, didFailWithError: error)
        }
    }

    nonisolated func eventMonitorDidDisconnect(_ monitor: PTPIPEventMonitor) {
        Task { @MainActor in
            print("[StandardEventSource] Event monitor disconnected")
            delegate?.eventSourceDidDisconnect(self)
        }
    }
}

// MARK: - Sony in-memory capture queue

private extension StandardEventSource {
    func enqueueSonyInMemoryTrigger(source: String) {
        sonyInMemoryPendingTriggers += 1
        print("[StandardEventSource] Sony in-memory trigger queued (\(source)), pending=\(sonyInMemoryPendingTriggers)")

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
        guard let photoOps = photoOps else { return }

        if let session = photoOps as? PTPIPSession {
            let ready = await waitForSonyObjectInMemoryReady(session)
            guard ready else {
                print("[StandardEventSource] Sony objectInMemory gate not satisfied; skipping trigger")
                return
            }
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
                print("[StandardEventSource] Sony in-memory GetObjectInfo failed after \(maxAttempts) attempts: \(error)")
                return
            }
        }

        guard let info = objectInfo else { return }

        let signature = (filename: info.filename, sequenceNumber: info.sequenceNumber, size: info.objectCompressedSize)
        lastSonyInMemorySignature = signature

        sonyInMemoryLogicalCounter &+= 1
        let logicalHandle: UInt32 = 0xFE000000 | (sonyInMemoryLogicalCounter & 0x00FFFFFF)

        // Skip RAW files (matching Canon behavior)
        if info.isRawFile {
            print("[StandardEventSource] Skipping RAW file (sony-in-mem): \(info.filename)")
            delegate?.eventSource(self, didSkipRawFile: info.filename)
            return
        }

        guard info.isJpegFile else {
            print("[StandardEventSource] Skipping non-JPEG (sony-in-mem): \(info.filename)")
            return
        }

        print("[StandardEventSource] Sony in-memory capture: downloadHandle=0x\(String(format: "%08X", sonyInMemoryHandle)) logicalHandle=0x\(String(format: "%08X", logicalHandle)) filename=\(info.filename) size=\(info.objectCompressedSize)")

        delegate?.eventSource(
            self,
            didDetectPhoto: logicalHandle,
            filename: info.filename,
            captureDate: Date(),
            fileSize: Int(info.objectCompressedSize)
        )

        do {
            if let session = photoOps as? PTPIPSession {
                let photoData = try await session.downloadPhoto(objectHandle: sonyInMemoryHandle, maxBytes: info.objectCompressedSize)
                print("[StandardEventSource] Photo 0x\(String(format: "%08X", logicalHandle)) downloaded (\(photoData.count) bytes)")
                delegate?.eventSource(self, didCompleteDownload: logicalHandle, data: photoData)
            } else {
                // Fallback (will likely re-fetch ObjectInfo internally)
                let photoData = try await photoOps.downloadPhoto(objectHandle: sonyInMemoryHandle)
                print("[StandardEventSource] Photo 0x\(String(format: "%08X", logicalHandle)) downloaded (\(photoData.count) bytes)")
                delegate?.eventSource(self, didCompleteDownload: logicalHandle, data: photoData)
            }
        } catch {
            // Do not fail the entire session for Sony event bursts; log and keep going.
            print("[StandardEventSource] Sony in-memory download failed: \(error)")
        }
    }

    func waitForSonyObjectInMemoryReady(_ session: PTPIPSession) async -> Bool {
        let deadline = Date().addingTimeInterval(35.0)
        let delayNs: UInt64 = 200_000_000 // 200ms

        while isMonitoring && Date() < deadline {
            do {
                if let value = try await session.getSonyObjectInMemoryValue() {
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
                    await handleObjectAdded(handle, source: "poll")
                }
            }
        } catch {
            print("[StandardEventSource] Polling error: \(error)")
        }
    }

    func handleObjectAdded(_ objectHandle: UInt32, source: String) async {
        guard let photoOps = photoOps else { return }

        do {
            // Get object info to check file type and metadata
            let objectInfo = try await photoOps.getObjectInfo(objectHandle: objectHandle)

            var logicalHandle = objectHandle

            // Sony in-memory handle needs a stable per-capture logical id for UI.
            if objectHandle == sonyInMemoryHandle {
                let signature = (filename: objectInfo.filename, sequenceNumber: objectInfo.sequenceNumber, size: objectInfo.objectCompressedSize)
                if let last = lastSonyInMemorySignature,
                   last.filename == signature.filename,
                   last.sequenceNumber == signature.sequenceNumber,
                   last.size == signature.size {
                    print("[StandardEventSource] Duplicate Sony in-memory capture ignored (\(source)): \(objectInfo.filename) seq=\(objectInfo.sequenceNumber) size=\(objectInfo.objectCompressedSize)")
                    return
                }

                lastSonyInMemorySignature = signature
                sonyInMemoryLogicalCounter &+= 1
                // Use a high-range synthetic handle for UI tracking (avoid collisions with real handles)
                logicalHandle = 0xFE000000 | (sonyInMemoryLogicalCounter & 0x00FFFFFF)
                print("[StandardEventSource] Sony in-memory capture: downloadHandle=0x\(String(format: "%08X", objectHandle)) logicalHandle=0x\(String(format: "%08X", logicalHandle)) seq=\(objectInfo.sequenceNumber)")
            }

            // Skip RAW files (matching Canon behavior)
            if objectInfo.isRawFile {
                print("[StandardEventSource] Skipping RAW file (\(source)): \(objectInfo.filename)")
                delegate?.eventSource(self, didSkipRawFile: objectInfo.filename)
                return
            }

            // Only download JPEG files
            if objectInfo.isJpegFile {
                print("[StandardEventSource] Downloading JPEG (\(source)): \(objectInfo.filename)")

                // Phase 1: Notify photo detected with metadata (before download)
                // Note: PTP captureDate is a string, use current time as approximation
                delegate?.eventSource(
                    self,
                    didDetectPhoto: logicalHandle,
                    filename: objectInfo.filename,
                    captureDate: Date(), // Use current time since PTP date is string format
                    fileSize: Int(objectInfo.objectCompressedSize)
                )

                // Phase 2: Download photo
                // Sony path uses partial object transfer; avoid re-fetching ObjectInfo.
                if let session = photoOps as? PTPIPSession {
                    let photoData = try await session.downloadPhoto(objectHandle: objectHandle, maxBytes: objectInfo.objectCompressedSize)
                    print("[StandardEventSource] Photo 0x\(String(format: "%08X", logicalHandle)) downloaded (\(photoData.count) bytes)")

                    // Phase 3: Notify download complete
                    delegate?.eventSource(
                        self,
                        didCompleteDownload: logicalHandle,
                        data: photoData
                    )
                    return
                }

                let photoData = try await photoOps.downloadPhoto(objectHandle: objectHandle)
                print("[StandardEventSource] Photo 0x\(String(format: "%08X", objectHandle)) downloaded (\(photoData.count) bytes)")

                // Phase 3: Notify download complete
                delegate?.eventSource(
                    self,
                    didCompleteDownload: logicalHandle,
                    data: photoData
                )
            } else {
                // Unknown format - log and skip
                print("[StandardEventSource] Skipping unknown format (\(source)): \(objectInfo.filename)")
            }
        } catch {
            print("[StandardEventSource] Photo download failed (\(source)): \(error)")
            delegate?.eventSource(self, didFailWithError: error)
        }
    }
}
