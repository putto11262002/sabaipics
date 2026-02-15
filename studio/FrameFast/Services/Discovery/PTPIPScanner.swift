//  PTPIPScanner.swift
//  FrameFast
//
//  Network scanner for PTP/IP cameras.
//  Scans explicit IP targets using PTP/IP handshake protocol.
//

import Foundation
import Network
import Combine

// MARK: - Scan State

enum ScanState: Equatable {
    case idle
    case scanning(current: Int, total: Int, currentIP: String?)
    case completed(found: Int)
    case error(ScanError)
}

// MARK: - Scan Error

enum ScanError: Error, LocalizedError {
    case cancelled
    case noTargets
    case networkUnavailable
    case timeout

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Scan cancelled"
        case .noTargets:
            return "No scan targets provided"
        case .networkUnavailable:
            return "Network unavailable"
        case .timeout:
            return "Scan timed out"
        }
    }
}

// MARK: - Scan Config

struct ScanConfig {
    var timeout: TimeInterval = 2.0
    var maxRetries: Int = 3
    var retryDelay: TimeInterval = 0.5
    var maxWaves: Int = 3
    var waveDelay: TimeInterval = 3.0

    static let `default` = ScanConfig()
}

// MARK: - PTP/IP Scanner

/// Scans network for cameras using PTP/IP handshake protocol
@MainActor
final class PTPIPScanner: ObservableObject {

    // MARK: - Published Properties

    /// Current scan state
    @Published private(set) var state: ScanState = .idle

    /// Callback when camera is discovered (ownership transfers to caller)
    var onCameraDiscovered: ((DiscoveredCamera) -> Void)?

    // MARK: - Private Properties

    /// Active scan task
    private var scanTask: Task<Void, Never>?

    /// PTP/IP port
    private let ptpipPort: UInt16 = 15740

    /// Host name for PTP/IP handshake
    private let hostName = "framefast"

    /// Background queue for network operations
    private let networkQueue = DispatchQueue(label: "com.framefast.ptpip.scanner", qos: .userInitiated)

    /// Persistent GUID for PTP/IP connections (shared with WiFiCameraService)
    private static let guidKey = "com.framefast.ptpip.guid"

    /// Get or create persistent GUID
    private var persistentGUID: UUID {
        if let guidString = UserDefaults.standard.string(forKey: Self.guidKey),
           let savedGUID = UUID(uuidString: guidString) {
            return savedGUID
        }
        let newGUID = UUID()
        UserDefaults.standard.set(newGUID.uuidString, forKey: Self.guidKey)
        log(.info, "Created new GUID: \(newGUID)")
        return newGUID
    }

    // MARK: - Logging

    private enum LogLevel {
        case debug, info, error
    }

    private func log(_ level: LogLevel, _ message: String) {
        let tag: String
        switch level {
        case .debug: tag = "DEBUG"
        case .info: tag = "INFO"
        case .error: tag = "ERROR"
        }
        print("[PTPIPScanner:\(tag)] \(message)")
    }

    // MARK: - Lifecycle

    deinit {
        scanTask?.cancel()
    }

    // MARK: - Public API

    /// Start scanning for cameras
    /// - Parameters:
    ///   - targets: List of IP addresses to scan
    ///   - config: Scan configuration
    func scan(targets: [String], config: ScanConfig = .default) async {
        // Validate
        guard !targets.isEmpty else {
            state = .error(.noTargets)
            log(.error, "No targets provided")
            return
        }

        // Cancel existing scan and wait for it to finish
        await stop()

        // Reset state
        state = .scanning(current: 0, total: targets.count, currentIP: nil)

        log(.info, "Starting scan: \(targets.count) target(s)")

        // Start scan task
        scanTask = Task {
            await performScan(targets: targets, config: config)
        }
    }

    /// Stop current scan and wait for it to finish
    func stop(timeout: TimeInterval = 2.0) async {
        guard let task = scanTask else { return }
        scanTask = nil
        task.cancel()

        // Race: wait for cancelled task to drain vs timeout.
        // Unlike withTaskGroup, this truly abandons slow work after timeout —
        // the drain continues in the background but we stop waiting.
        let once = OnceFlag()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            Task {
                await task.value
                if once.claim() { continuation.resume() }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if once.claim() { continuation.resume() }
            }
        }

        if case .scanning = state {
            log(.info, "Scan stopped")
            state = .idle
        }
    }

    // MARK: - Scanning

    private func performScan(targets: [String], config: ScanConfig) async {
        let scanStart = Date()
        var totalFound = 0
        var foundIPs: Set<String> = []

        log(.info, "Scan starting - \(targets.count) targets, \(config.maxWaves) wave(s), timeout: \(config.timeout)s")

        for wave in 1...config.maxWaves {
            guard !Task.isCancelled else {
                log(.info, "Cancelled before wave \(wave)")
                await MainActor.run { state = .idle }
                return
            }

            let waveTargets = targets.filter { !foundIPs.contains($0) }
            guard !waveTargets.isEmpty else {
                log(.info, "Wave \(wave) skipped — all targets already found")
                break
            }

            log(.info, "Wave \(wave)/\(config.maxWaves) starting (\(waveTargets.count) target(s))")
            var completedCount = 0
            var waveFound = 0

            await withTaskGroup(of: DiscoveredCamera?.self) { group in
                for ip in waveTargets {
                    group.addTask {
                        guard !Task.isCancelled else { return nil }
                        return await self.scanIP(ip, config: config)
                    }
                }

                for await result in group {
                    completedCount += 1

                    let currentIP = completedCount < targets.count ? targets[completedCount] : nil
                    await MainActor.run {
                        state = .scanning(
                            current: completedCount,
                            total: targets.count,
                            currentIP: currentIP
                        )
                    }

                    if let camera = result {
                        waveFound += 1
                        foundIPs.insert(camera.ipAddress)
                        log(.info, "Found: \(camera.name) at \(camera.ipAddress)")
                        await MainActor.run {
                            onCameraDiscovered?(camera)
                        }
                    }

                    if Task.isCancelled {
                        log(.info, "Cancelled during wave \(wave) at \(completedCount)/\(targets.count)")
                        group.cancelAll()
                        await MainActor.run { state = .idle }
                        return
                    }
                }
            }

            totalFound += waveFound
            log(.info, "Wave \(wave)/\(config.maxWaves) done - found: \(waveFound)")

            // Wait before next wave (only if no cameras found yet)
            if wave < config.maxWaves && foundIPs.isEmpty {
                log(.info, "No cameras found, waiting \(config.waveDelay)s before wave \(wave + 1)")
                do {
                    try await Task.sleep(nanoseconds: UInt64(config.waveDelay * 1_000_000_000))
                } catch {
                    log(.info, "Cancelled during wave delay")
                    await MainActor.run { state = .idle }
                    return
                }
            }
        }

        let duration = Date().timeIntervalSince(scanStart)
        log(.info, "Scan complete - found: \(totalFound), duration: \(String(format: "%.2f", duration))s")

        await MainActor.run {
            state = .completed(found: totalFound)
        }
    }

    // MARK: - IP Scanning

    /// Scan a single IP for a camera
    private func scanIP(_ ip: String, config: ScanConfig) async -> DiscoveredCamera? {
        let scanStart = Date()
        log(.debug, "[\(ip)] Scan starting")

        var commandConnection: NWConnection?
        var eventConnection: NWConnection?

        func cleanupConnections() {
            commandConnection?.cancel()
            eventConnection?.cancel()
        }

        // === STAGE 1: TCP Connect (Command Channel) with retry ===
        guard !Task.isCancelled else {
            log(.debug, "[\(ip)] Cancelled before connect")
            return nil
        }

        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: ptpipPort)!

        var tcpConnected = false
        var lastError: Error?

        for attempt in 1...config.maxRetries {
            guard !Task.isCancelled else {
                cleanupConnections()
                return nil
            }

            commandConnection?.cancel()
            commandConnection = NWConnection(host: host, port: port, using: .tcp)
            commandConnection?.start(queue: networkQueue)

            do {
                try await waitForConnection(commandConnection!, timeout: config.timeout)
                log(.debug, "[\(ip)] TCP connected (attempt \(attempt))")
                tcpConnected = true
                break
            } catch {
                lastError = error

                if isRetryableError(error) && attempt < config.maxRetries {
                    log(.debug, "[\(ip)] Retryable error, waiting \(config.retryDelay)s...")
                    try? await Task.sleep(nanoseconds: UInt64(config.retryDelay * 1_000_000_000))
                } else if !isRetryableError(error) {
                    log(.debug, "[\(ip)] Non-retryable error, fail fast")
                    cleanupConnections()
                    return nil
                }
            }
        }

        guard tcpConnected else {
            let duration = Date().timeIntervalSince(scanStart)
            log(.debug, "[\(ip)] Failed after \(String(format: "%.2f", duration))s - TCP exhausted")
            cleanupConnections()
            return nil
        }

        // === STAGE 2: Init Command Handshake ===
        guard !Task.isCancelled else {
            log(.debug, "[\(ip)] Cancelled after TCP connect")
            cleanupConnections()
            return nil
        }

        do {
            // Send Init Command Request
            let initRequest = PTPIPInitCommandRequest(guid: persistentGUID, hostName: hostName)
            try await sendData(connection: commandConnection!, data: initRequest.toData())

            // Receive Init Command Ack
            let ackHeaderData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: 8,
                timeout: config.timeout
            )

            guard let header = PTPIPHeader.from(ackHeaderData),
                  header.type == PTPIPPacketType.initCommandAck.rawValue else {
                log(.debug, "[\(ip)] Invalid packet type")
                cleanupConnections()
                return nil
            }

            // Read payload
            let payloadLength = Int(header.length) - 8
            let payloadData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: payloadLength,
                timeout: config.timeout
            )

            guard payloadData.count >= 4 else {
                log(.debug, "[\(ip)] Payload too short")
                cleanupConnections()
                return nil
            }

            let connectionNumber = payloadData.withUnsafeBytes {
                UInt32(littleEndian: $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self))
            }

            // Extract camera name
            var cameraName = "Unknown Camera"
            if payloadData.count >= 20 {
                let nameData = payloadData.dropFirst(20)
                if let name = String(data: nameData, encoding: .utf16LittleEndian)?
                    .trimmingCharacters(in: .controlCharacters), !name.isEmpty {
                    cameraName = name
                }
            }

            // === STAGE 3: TCP Connect (Event Channel) ===
            guard !Task.isCancelled else {
                log(.debug, "[\(ip)] Cancelled before event channel")
                cleanupConnections()
                return nil
            }

            eventConnection = NWConnection(host: host, port: port, using: .tcp)
            eventConnection?.start(queue: networkQueue)

            try await waitForConnection(eventConnection!, timeout: config.timeout)

            // === STAGE 4: Init Event Handshake ===
            guard !Task.isCancelled else {
                log(.debug, "[\(ip)] Cancelled before event handshake")
                cleanupConnections()
                return nil
            }

            let eventRequest = PTPIPInitEventRequest(connectionNumber: connectionNumber)
            try await sendData(connection: eventConnection!, data: eventRequest.toData())

            let eventAckHeaderData = try await receiveWithTimeout(
                connection: eventConnection!,
                length: 8,
                timeout: config.timeout
            )

            guard let eventAckHeader = PTPIPHeader.from(eventAckHeaderData),
                  eventAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
                log(.debug, "[\(ip)] Event handshake failed")
                cleanupConnections()
                return nil
            }

            // === STAGE 5: Prepare Session ===
            log(.debug, "[\(ip)] Session preparation (commit point)")

            let sessionID = UInt32.random(in: 1...UInt32.max)
            let session = await PTPIPSession(sessionID: sessionID, guid: persistentGUID)

            do {
                try await session.prepareSession(
                    commandConnection: commandConnection!,
                    eventConnection: eventConnection!,
                    connectionNumber: connectionNumber,
                    cameraName: cameraName
                )

                let duration = Date().timeIntervalSince(scanStart)
                log(.info, "[\(ip)] Success in \(String(format: "%.2f", duration))s - \(cameraName)")

                return DiscoveredCamera(
                    name: cameraName,
                    ipAddress: ip,
                    connectionNumber: connectionNumber,
                    session: session
                )

            } catch {
                let duration = Date().timeIntervalSince(scanStart)
                log(.debug, "[\(ip)] Failed after \(String(format: "%.2f", duration))s - session prep error")
                await session.disconnect()
                cleanupConnections()
                return nil
            }

        } catch {
            let duration = Date().timeIntervalSince(scanStart)
            log(.debug, "[\(ip)] Failed after \(String(format: "%.2f", duration))s - handshake error")
            cleanupConnections()
            return nil
        }
    }

    // MARK: - Network Helpers

    private func waitForConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        final class ConnectionState: @unchecked Sendable {
            var isCompleted = false
            var result: Result<Void, Error>?
            let lock = NSLock()

            func complete(with result: Result<Void, Error>) -> Bool {
                lock.lock()
                defer { lock.unlock() }
                guard !isCompleted else { return false }
                isCompleted = true
                self.result = result
                return true
            }
        }

        let state = ConnectionState()

        connection.stateUpdateHandler = { connectionState in
            switch connectionState {
            case .ready:
                _ = state.complete(with: .success(()))
            case .failed(let error):
                _ = state.complete(with: .failure(error))
            case .waiting(let error):
                _ = state.complete(with: .failure(error))
            case .cancelled:
                _ = state.complete(with: .failure(ScanError.cancelled))
            case .setup, .preparing:
                break
            @unknown default:
                break
            }
        }

        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            state.lock.lock()
            let completed = state.isCompleted
            let result = state.result
            state.lock.unlock()

            if completed, let result = result {
                switch result {
                case .success:
                    return
                case .failure(let error):
                    throw error
                }
            }

            try await Task.sleep(nanoseconds: 50_000_000)
        }

        _ = state.complete(with: .failure(ScanError.timeout))
        throw ScanError.timeout
    }

    private func sendData(connection: NWConnection, data: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    private func receiveWithTimeout(connection: NWConnection, length: Int, timeout: TimeInterval) async throws -> Data {
        try await withThrowingTaskGroup(of: Data.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { continuation in
                    connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                        if let error = error {
                            continuation.resume(throwing: error)
                        } else if isComplete {
                            continuation.resume(throwing: ScanError.networkUnavailable)
                        } else if let data = content {
                            continuation.resume(returning: data)
                        } else {
                            continuation.resume(throwing: ScanError.networkUnavailable)
                        }
                    }
                }
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw ScanError.timeout
            }

            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    // MARK: - Error Helpers

    /// Thread-safe one-shot flag for continuation racing.
    private final class OnceFlag: @unchecked Sendable {
        private var claimed = false
        private let lock = NSLock()
        func claim() -> Bool {
            lock.lock()
            defer { lock.unlock() }
            guard !claimed else { return false }
            claimed = true
            return true
        }
    }

    private func isRetryableError(_ error: Error) -> Bool {
        if let nwError = error as? NWError {
            switch nwError {
            case .posix(let code):
                return code == .ECONNREFUSED || code == .ETIMEDOUT
            default:
                return false
            }
        }
        return false
    }
}
