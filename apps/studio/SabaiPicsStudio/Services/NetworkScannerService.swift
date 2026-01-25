//
//  NetworkScannerService.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  SAB-23: Network scanning for camera discovery
//
//  Scans the Personal Hotspot subnet for cameras by attempting
//  PTP/IP Init handshake on port 15740.
//
//  Key design decisions:
//  - Scans IP range .2-.20 (cameras usually get low IPs from DHCP)
//  - Keeps connections OPEN after discovery (reuse for session)
//  - Real-time updates via Combine publisher
//

import Foundation
import Network
import Combine

// MARK: - Scanner Errors

enum NetworkScannerError: LocalizedError {
    case noHotspotDetected
    case scanFailed(String)
    case timeout

    var errorDescription: String? {
        switch self {
        case .noHotspotDetected:
            return "Personal Hotspot not detected"
        case .scanFailed(let reason):
            return "Scan failed: \(reason)"
        case .timeout:
            return "Scan timed out"
        }
    }
}

// MARK: - Scanner State

/// State of the network scanner
enum NetworkScannerState: Equatable {
    case idle
    case scanning(progress: Double)  // 0.0 - 1.0
    case completed(cameraCount: Int)
    case error(String)
}

// MARK: - Network Scanner Service

/// Scans the local network for cameras using PTP/IP handshake
/// Optimized for iPhone Personal Hotspot (172.20.10.x subnet)
@MainActor
class NetworkScannerService: ObservableObject {

    // MARK: - Published Properties

    /// Current scanner state
    @Published var state: NetworkScannerState = .idle

    /// Discovered cameras (updated in real-time as cameras are found)
    @Published var discoveredCameras: [DiscoveredCamera] = []

    /// Current IP being scanned (for progress display)
    @Published var currentScanIP: String = ""

    // MARK: - Configuration

    /// Personal Hotspot subnet (iOS default)
    private let hotspotSubnet = "172.20.10"

    /// IP range to scan (cameras typically get low IPs)
    private let scanRange = 2...20

    /// PTP/IP port
    private let ptpipPort: UInt16 = 15740

    /// Timeout for each IP scan (fast timeout for non-responsive IPs)
    private let perIPTimeout: TimeInterval = 2.0

    /// Maximum scan waves (for late-joining cameras)
    private let maxScanWaves = 3

    /// Delay between scan waves
    private let waveDelay: TimeInterval = 3.0

    /// Maximum retry attempts per IP for TCP connection
    private let maxRetryAttempts = 3

    /// Delay between retries
    private let retryDelay: TimeInterval = 0.5

    /// Background queue for network operations (avoids main thread deadlock)
    private let networkQueue = DispatchQueue(label: "com.sabaipics.scanner.network", qos: .userInitiated)

    /// Persistent GUID for PTP/IP connections (like libgphoto2)
    /// MUST use the same key as WiFiCameraService so Canon cameras recognize us
    private static let guidKey = "com.sabaipics.ptpip.guid"

    /// Get or create persistent GUID (shared with WiFiCameraService)
    private var persistentGUID: UUID {
        if let guidString = UserDefaults.standard.string(forKey: Self.guidKey),
           let savedGUID = UUID(uuidString: guidString) {
            print("[NetworkScannerService] Using saved GUID: \(savedGUID)")
            return savedGUID
        }
        let newGUID = UUID()
        UserDefaults.standard.set(newGUID.uuidString, forKey: Self.guidKey)
        print("[NetworkScannerService] Created new GUID: \(newGUID)")
        return newGUID
    }

    // MARK: - Private Properties

    /// Active scan task (for cancellation)
    private var scanTask: Task<Void, Never>?

    /// Host name for PTP/IP handshake
    private let hostName = "sabaipics-studio"

    // MARK: - Public Methods

    /// Check if Personal Hotspot is active
    /// Detects bridge* interface which indicates hotspot is sharing
    /// nonisolated: This is a pure function that only reads system network interfaces
    nonisolated static func isHotspotActive() -> Bool {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?

        guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
            return false
        }

        defer { freeifaddrs(ifaddr) }

        var addr = firstAddr
        while true {
            let name = String(cString: addr.pointee.ifa_name)

            // bridge* interface indicates Personal Hotspot is active
            if name.hasPrefix("bridge") {
                return true
            }

            guard let next = addr.pointee.ifa_next else {
                break
            }
            addr = next
        }

        return false
    }

    /// Start scanning for cameras on the network
    /// Scans .2-.20 range on Personal Hotspot subnet
    func startScan() {
        // Cancel any existing scan
        stopScan()

        // Clear previous results
        discoveredCameras = []
        state = .scanning(progress: 0.0)

        scanTask = Task {
            await performScan()
        }
    }

    /// Stop the current scan
    /// NOTE: This ONLY cancels in-flight scan tasks. It does NOT disconnect any discovered cameras.
    /// To disconnect cameras, use disconnectOtherCameras() or disconnectAllCameras() explicitly.
    func stopScan() {
        print("[NetworkScannerService] stopScan() called - cancelling scan tasks only")
        print("[NetworkScannerService]    Current cameras: \(discoveredCameras.count)")

        // Cancel the scan task - this propagates to TaskGroup
        scanTask?.cancel()
        scanTask = nil

        // Update state if still scanning
        if case .scanning = state {
            print("[NetworkScannerService]    State was .scanning -> .completed(\(discoveredCameras.count))")
            state = .completed(cameraCount: discoveredCameras.count)
        }

        // NOTE: We do NOT disconnect any cameras here!
        // Sessions stay alive until explicitly disconnected.
        print("[NetworkScannerService]    Scan stopped. Sessions untouched.")
    }

    /// Disconnect all cameras EXCEPT the selected one
    /// Call this after user selects a camera
    /// - Parameter selected: The camera that was selected (will NOT be disconnected)
    func disconnectOtherCameras(except selected: DiscoveredCamera) async {
        print("[NetworkScannerService] disconnectOtherCameras() - keeping: \(selected.name)")

        var disconnectedCount = 0
        for camera in discoveredCameras where camera.id != selected.id {
            print("[NetworkScannerService]    Disconnecting: \(camera.name) (\(camera.ipAddress))")
            await camera.disconnect()
            disconnectedCount += 1
        }

        print("[NetworkScannerService]    Disconnected \(disconnectedCount) other camera(s)")
    }

    /// Disconnect ALL discovered cameras
    /// Call this when navigating away without selection
    func disconnectAllCameras() async {
        print("[NetworkScannerService] disconnectAllCameras() - \(discoveredCameras.count) cameras")

        for camera in discoveredCameras {
            print("[NetworkScannerService]    Disconnecting: \(camera.name) (\(camera.ipAddress))")
            await camera.disconnect()
        }

        print("[NetworkScannerService]    All cameras disconnected")
    }

    /// Close all connections and reset state
    /// Call this when completely leaving the discovery flow
    func cleanup() {
        print("[NetworkScannerService] cleanup() - full reset")

        // Stop scanning first
        stopScan()

        // Disconnect all cameras
        let camerasToCleanup = discoveredCameras
        discoveredCameras = []
        state = .idle

        if !camerasToCleanup.isEmpty {
            Task {
                for camera in camerasToCleanup {
                    print("[NetworkScannerService]    Cleanup disconnecting: \(camera.name)")
                    await camera.disconnect()
                }
                print("[NetworkScannerService]    Cleanup complete")
            }
        } else {
            print("[NetworkScannerService]    No cameras to cleanup")
        }
    }

    // MARK: - Private Methods

    /// Format timestamp for logging (seconds since app start with milliseconds)
    private static let appStartTime = Date()
    private func ts() -> String {
        let elapsed = Date().timeIntervalSince(Self.appStartTime)
        return String(format: "%07.3f", elapsed)
    }

    /// Perform the actual network scan - ALL IPs IN PARALLEL with wave-based retry
    /// Layer 1: Up to 3 scan waves (handles cameras joining network late)
    /// Layer 2: Per-IP retry within scanIP() (handles slow PTP/IP startup)
    private func performScan() async {
        let totalIPs = scanRange.count
        let scanStart = Date()
        print("[\(ts())] [Scanner] ========================================")
        print("[\(ts())] [Scanner] Starting wave-based scan")
        print("[\(ts())] [Scanner]   IP range: \(hotspotSubnet).2-20 (\(totalIPs) IPs)")
        print("[\(ts())] [Scanner]   Max waves: \(maxScanWaves), Wave delay: \(waveDelay)s")
        print("[\(ts())] [Scanner]   Per-IP timeout: \(perIPTimeout)s, Retries: \(maxRetryAttempts), Retry delay: \(retryDelay)s")
        print("[\(ts())] [Scanner] ========================================")

        // Wave-based scanning - up to maxScanWaves attempts
        for wave in 1...maxScanWaves {
            // Check for cancellation before starting wave
            guard !Task.isCancelled else {
                print("[Scanner] CANCELLED before wave \(wave)")
                state = .idle
                return
            }

            let waveStart = Date()
            print("[\(ts())] [Scanner] ----------------------------------------")
            print("[\(ts())] [Scanner] WAVE \(wave)/\(maxScanWaves) starting")
            print("[\(ts())] [Scanner]   Cameras found so far: \(discoveredCameras.count)")
            print("[\(ts())] [Scanner]   Launching \(totalIPs) parallel scans...")

            // Track completed count for progress within this wave
            var completedCount = 0
            var waveFoundCount = 0

            // Scan ALL IPs in parallel using TaskGroup
            await withTaskGroup(of: DiscoveredCamera?.self) { group in
                // Launch all scans simultaneously
                for lastOctet in scanRange {
                    let ip = "\(hotspotSubnet).\(lastOctet)"

                    group.addTask {
                        // Check for cancellation before each IP scan
                        guard !Task.isCancelled else { return nil }
                        return await self.scanIP(ip)
                    }
                }

                // Collect results as they complete
                for await result in group {
                    completedCount += 1

                    // Update progress: account for wave position
                    // Each wave contributes 1/maxScanWaves to total progress
                    let waveProgress = Double(completedCount) / Double(totalIPs)
                    let overallProgress = (Double(wave - 1) + waveProgress) / Double(maxScanWaves)
                    state = .scanning(progress: overallProgress)
                    currentScanIP = "Wave \(wave)/\(maxScanWaves) - \(completedCount)/\(totalIPs)"

                    // If camera found, add to list immediately
                    if let camera = result {
                        waveFoundCount += 1
                        discoveredCameras.append(camera)
                        print("[\(ts())] [Scanner] FOUND camera: \(camera.name) at \(camera.ipAddress)")
                    }

                    // Check for cancellation
                    if Task.isCancelled {
                        print("[Scanner] CANCELLED during wave \(wave) at \(completedCount)/\(totalIPs)")
                        group.cancelAll()
                        state = .idle
                        return
                    }
                }
            }

            let waveDuration = Date().timeIntervalSince(waveStart)
            print("[\(ts())] [Scanner] WAVE \(wave)/\(maxScanWaves) complete in \(String(format: "%.2f", waveDuration))s, found: \(waveFoundCount)")

            // Early exit if we found cameras - no need to continue waves
            if !discoveredCameras.isEmpty {
                print("[Scanner] Camera(s) found, stopping waves early")
                break
            }

            // If more waves remain, wait before next wave
            if wave < maxScanWaves {
                // Check for cancellation before delay
                guard !Task.isCancelled else {
                    print("[Scanner] CANCELLED before wave delay")
                    state = .idle
                    return
                }

                print("[Scanner] No cameras found, waiting \(waveDelay)s before wave \(wave + 1)...")

                do {
                    try await Task.sleep(nanoseconds: UInt64(waveDelay * 1_000_000_000))
                    print("[Scanner] Wave delay complete")
                } catch {
                    // Sleep was cancelled
                    print("[Scanner] CANCELLED during wave delay")
                    state = .idle
                    return
                }
            }
        }

        // Scan complete
        let totalDuration = Date().timeIntervalSince(scanStart)
        currentScanIP = ""
        state = .completed(cameraCount: discoveredCameras.count)
        print("[\(ts())] [Scanner] ========================================")
        print("[\(ts())] [Scanner] SCAN COMPLETE in \(String(format: "%.2f", totalDuration))s, found: \(discoveredCameras.count)")
        print("[\(ts())] [Scanner] ========================================")
    }

    /// Check if error is retryable (camera might still be initializing)
    /// - ECONNREFUSED: Port not listening yet - retry
    /// - ETIMEDOUT: Slow response - retry
    /// - EHOSTUNREACH: No such host - fail fast
    /// - ENETUNREACH: Wrong network - fail fast
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

    /// Get human-readable error code description for logging
    private func errorCodeDescription(_ error: Error) -> String {
        if let nwError = error as? NWError {
            switch nwError {
            case .posix(let code):
                switch code {
                case .ECONNREFUSED: return "ECONNREFUSED (port not listening)"
                case .ETIMEDOUT: return "ETIMEDOUT (no response)"
                case .EHOSTUNREACH: return "EHOSTUNREACH (no route to host)"
                case .ENETUNREACH: return "ENETUNREACH (network unreachable)"
                case .EACCES: return "EACCES (permission denied)"
                case .ECONNRESET: return "ECONNRESET (connection reset)"
                default: return "POSIX:\(code.rawValue)"
                }
            case .dns(let dnsError):
                return "DNS:\(dnsError)"
            case .tls(let tlsStatus):
                return "TLS:\(tlsStatus)"
            @unknown default:
                return nwError.localizedDescription
            }
        }
        if error is CancellationError {
            return "CANCELLED"
        }
        if let scanError = error as? NetworkScannerError {
            switch scanError {
            case .timeout:
                return "TIMEOUT (no response in \(perIPTimeout)s)"
            case .scanFailed(let reason):
                return "SCAN_FAILED: \(reason)"
            case .noHotspotDetected:
                return "NO_HOTSPOT"
            }
        }
        return error.localizedDescription
    }

    /// Scan a single IP address for a camera
    /// Returns DiscoveredCamera if found, nil otherwise
    ///
    /// Cancellation behavior:
    /// - Stages 1-4: Check for cancellation, cleanup and return nil
    /// - Stage 5 (Session prep): COMMIT POINT - complete even if cancelled, return result
    ///
    /// Layer 2 Retry: TCP connect retries up to maxRetryAttempts for retryable errors
    ///
    /// - Parameter ip: IP address to scan
    /// - Returns: DiscoveredCamera if camera found, nil otherwise
    private func scanIP(_ ip: String) async -> DiscoveredCamera? {
        let scanStart = Date()
        print("[\(ts())] [Scanner:\(ip)] Starting scan")

        // Track resources for cleanup
        var commandConnection: NWConnection?
        var eventConnection: NWConnection?

        // Cleanup helper - cancels connections but NOT sessions
        func cleanupConnections() {
            commandConnection?.cancel()
            eventConnection?.cancel()
        }

        // === STAGE 1: TCP Connect (Command Channel) with retry ===
        guard !Task.isCancelled else {
            print("[Scanner:\(ip)] CANCELLED before TCP connect")
            return nil
        }

        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: ptpipPort)!

        print("[Scanner:\(ip)] Stage 1: TCP connect to port \(ptpipPort)")

        // Retry loop for TCP connection (Layer 2)
        var tcpConnected = false
        let tcpStart = Date()
        for attempt in 1...maxRetryAttempts {
            // Check for cancellation before each retry attempt
            guard !Task.isCancelled else {
                print("[Scanner:\(ip)] CANCELLED during TCP retry")
                cleanupConnections()
                return nil
            }

            print("[Scanner:\(ip)]   TCP attempt \(attempt)/\(maxRetryAttempts)...")

            // Clean up previous failed connection attempt
            commandConnection?.cancel()
            commandConnection = NWConnection(host: host, port: port, using: .tcp)
            commandConnection?.start(queue: networkQueue)

            do {
                try await waitForConnection(commandConnection!, timeout: perIPTimeout)
                let tcpDuration = Date().timeIntervalSince(tcpStart)
                print("[Scanner:\(ip)]   TCP connected in \(String(format: "%.2f", tcpDuration))s (attempt \(attempt))")
                tcpConnected = true
                break  // Success - exit retry loop
            } catch {
                // Classify the error
                let errorCode = errorCodeDescription(error)
                let isRetryable = isRetryableError(error)

                if isRetryable {
                    // Retryable error - log and maybe retry
                    if attempt < maxRetryAttempts {
                        print("[Scanner:\(ip)]   TCP failed: \(errorCode) (retryable), waiting \(retryDelay)s...")

                        // Wait before retry
                        do {
                            try await Task.sleep(nanoseconds: UInt64(retryDelay * 1_000_000_000))
                        } catch {
                            // Sleep cancelled
                            print("[Scanner:\(ip)]   CANCELLED during retry delay")
                            cleanupConnections()
                            return nil
                        }
                    } else {
                        print("[Scanner:\(ip)]   TCP failed: \(errorCode) (retryable), max retries reached")
                    }
                } else {
                    // Non-retryable error - fail fast
                    print("[Scanner:\(ip)]   TCP failed: \(errorCode) (not retryable, fail fast)")
                    cleanupConnections()
                    return nil
                }
            }
        }

        // If TCP connection failed after all retries
        guard tcpConnected else {
            let duration = Date().timeIntervalSince(scanStart)
            print("[Scanner:\(ip)] FAILED after \(String(format: "%.2f", duration))s - TCP connect exhausted retries")
            cleanupConnections()
            return nil
        }

        // === STAGE 2: Init Command Handshake ===
        guard !Task.isCancelled else {
            print("[Scanner:\(ip)] CANCELLED after TCP connect")
            cleanupConnections()
            return nil
        }

        print("[Scanner:\(ip)] Stage 2: PTP/IP Init handshake")

        do {
            // Send Init Command Request
            let initRequest = PTPIPInitCommandRequest(guid: persistentGUID, hostName: hostName)
            try await sendData(connection: commandConnection!, data: initRequest.toData())
            print("[Scanner:\(ip)]   Sent InitCommandRequest")

            // Receive Init Command Ack
            let ackHeaderData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: 8,
                timeout: perIPTimeout
            )

            guard let header = PTPIPHeader.from(ackHeaderData),
                  header.type == PTPIPPacketType.initCommandAck.rawValue else {
                print("[Scanner:\(ip)]   FAILED: Invalid or wrong packet type")
                cleanupConnections()
                return nil
            }
            print("[Scanner:\(ip)]   Received InitCommandAck")

            // Read payload
            let payloadLength = Int(header.length) - 8
            let payloadData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: payloadLength,
                timeout: perIPTimeout
            )

            guard payloadData.count >= 4 else {
                print("[Scanner:\(ip)]   FAILED: Payload too short (\(payloadData.count) bytes)")
                cleanupConnections()
                return nil
            }

            let connectionNumber = payloadData.withUnsafeBytes {
                UInt32(littleEndian: $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self))
            }
            print("[Scanner:\(ip)]   ConnectionNumber: \(connectionNumber)")

            // Extract camera name
            var cameraName = "Unknown Camera"
            if payloadData.count >= 20 {
                let nameData = payloadData.dropFirst(20)
                if let name = String(data: nameData, encoding: .utf16LittleEndian)?
                    .trimmingCharacters(in: .controlCharacters), !name.isEmpty {
                    cameraName = name
                }
            }
            print("[Scanner:\(ip)]   Camera name: \(cameraName)")

            // === STAGE 3: TCP Connect (Event Channel) ===
            guard !Task.isCancelled else {
                print("[Scanner:\(ip)] CANCELLED before event channel")
                cleanupConnections()
                return nil
            }

            print("[Scanner:\(ip)] Stage 3: Event channel TCP connect")

            eventConnection = NWConnection(host: host, port: port, using: .tcp)
            eventConnection?.start(queue: networkQueue)

            try await waitForConnection(eventConnection!, timeout: perIPTimeout)
            print("[Scanner:\(ip)]   Event channel connected")

            // === STAGE 4: Init Event Handshake ===
            guard !Task.isCancelled else {
                print("[Scanner:\(ip)] CANCELLED before event handshake")
                cleanupConnections()
                return nil
            }

            print("[Scanner:\(ip)] Stage 4: Event channel handshake")

            let eventRequest = PTPIPInitEventRequest(connectionNumber: connectionNumber)
            try await sendData(connection: eventConnection!, data: eventRequest.toData())
            print("[Scanner:\(ip)]   Sent InitEventRequest")

            let eventAckHeaderData = try await receiveWithTimeout(
                connection: eventConnection!,
                length: 8,
                timeout: perIPTimeout
            )

            guard let eventAckHeader = PTPIPHeader.from(eventAckHeaderData),
                  eventAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
                print("[Scanner:\(ip)]   FAILED: Event channel handshake failed")
                cleanupConnections()
                return nil
            }
            print("[Scanner:\(ip)]   Received InitEventAck - handshake complete")

            // === STAGE 5: Prepare Session (COMMIT POINT) ===
            // Once we reach here, we FINISH session setup even if cancelled.
            // A successfully prepared session is valuable - don't throw it away!
            print("[Scanner:\(ip)] Stage 5: Session preparation (COMMIT POINT)")
            print("[Scanner:\(ip)]   Will complete even if cancelled - session is valuable")

            let sessionID = UInt32.random(in: 1...UInt32.max)
            let session = await PTPIPSession(sessionID: sessionID, guid: self.persistentGUID)

            do {
                try await session.prepareSession(
                    commandConnection: commandConnection!,
                    eventConnection: eventConnection!,
                    connectionNumber: connectionNumber,
                    cameraName: cameraName
                )

                // SUCCESS - Return even if Task.isCancelled is now true
                // The session is valuable - the caller can decide what to do with it
                let totalDuration = Date().timeIntervalSince(scanStart)
                let wasCancelled = Task.isCancelled
                print("[Scanner:\(ip)] SUCCESS in \(String(format: "%.2f", totalDuration))s")
                print("[Scanner:\(ip)]   Camera: \(cameraName)")
                print("[Scanner:\(ip)]   Session ID: \(sessionID)")
                print("[Scanner:\(ip)]   Was cancelled: \(wasCancelled)")

                return DiscoveredCamera(
                    name: cameraName,
                    ipAddress: ip,
                    connectionNumber: connectionNumber,
                    session: session
                )

            } catch {
                // Session preparation failed - clean up everything
                let totalDuration = Date().timeIntervalSince(scanStart)
                print("[Scanner:\(ip)] FAILED after \(String(format: "%.2f", totalDuration))s")
                print("[Scanner:\(ip)]   Session preparation error: \(error.localizedDescription)")
                await session.disconnect()
                cleanupConnections()
                return nil
            }

        } catch {
            // Any error in stages 2-4 - clean up
            let totalDuration = Date().timeIntervalSince(scanStart)
            print("[Scanner:\(ip)] FAILED after \(String(format: "%.2f", totalDuration))s - \(error.localizedDescription)")
            cleanupConnections()
            return nil
        }
    }

    /// Wait for NWConnection to reach ready state with timeout
    /// Uses actor-isolated state to safely handle the race between connection and timeout
    private func waitForConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        // Use a class to share state between callback and timeout
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
        
        // Set up connection state handler
        connection.stateUpdateHandler = { connectionState in
            switch connectionState {
            case .ready:
                if state.complete(with: .success(())) {
                    // State changed to ready
                }
            case .failed(let error):
                _ = state.complete(with: .failure(error))
            case .waiting(let error):
                // .waiting means blocked (permission denied, no route, etc.)
                _ = state.complete(with: .failure(error))
            case .cancelled:
                _ = state.complete(with: .failure(CancellationError()))
            case .setup, .preparing:
                break  // Still connecting, wait
            @unknown default:
                break
            }
        }
        
        // Poll with timeout
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            // Check if completed
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
            
            // Sleep briefly before checking again
            try await Task.sleep(nanoseconds: 50_000_000)  // 50ms
        }
        
        // Timeout - mark as completed to prevent late callbacks
        _ = state.complete(with: .failure(NetworkScannerError.timeout))
        throw NetworkScannerError.timeout
    }

    /// Send data to connection
    private func sendData(connection: NWConnection, data: Data) async throws {
        return try await withCheckedThrowingContinuation { continuation in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    /// Receive data with timeout
    private func receiveWithTimeout(connection: NWConnection, length: Int, timeout: TimeInterval) async throws -> Data {
        return try await withThrowingTaskGroup(of: Data.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { continuation in
                    connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                        if let error = error {
                            continuation.resume(throwing: error)
                        } else if isComplete {
                            continuation.resume(throwing: NetworkScannerError.scanFailed("Connection closed"))
                        } else if let data = content {
                            continuation.resume(returning: data)
                        } else {
                            continuation.resume(throwing: NetworkScannerError.scanFailed("No data"))
                        }
                    }
                }
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw NetworkScannerError.timeout
            }

            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }
}
