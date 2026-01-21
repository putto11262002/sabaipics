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
        print("[NetworkScannerService] 🛑 stopScan() called - cancelling scan tasks only")
        print("[NetworkScannerService]    Current cameras: \(discoveredCameras.count)")

        // Cancel the scan task - this propagates to TaskGroup
        scanTask?.cancel()
        scanTask = nil

        // Update state if still scanning
        if case .scanning = state {
            print("[NetworkScannerService]    State was .scanning → .completed(\(discoveredCameras.count))")
            state = .completed(cameraCount: discoveredCameras.count)
        }

        // NOTE: We do NOT disconnect any cameras here!
        // Sessions stay alive until explicitly disconnected.
        print("[NetworkScannerService]    ✓ Scan stopped. Sessions untouched.")
    }

    /// Disconnect all cameras EXCEPT the selected one
    /// Call this after user selects a camera
    /// - Parameter selected: The camera that was selected (will NOT be disconnected)
    func disconnectOtherCameras(except selected: DiscoveredCamera) async {
        print("[NetworkScannerService] 🔌 disconnectOtherCameras() - keeping: \(selected.name)")

        var disconnectedCount = 0
        for camera in discoveredCameras where camera.id != selected.id {
            print("[NetworkScannerService]    Disconnecting: \(camera.name) (\(camera.ipAddress))")
            await camera.disconnect()
            disconnectedCount += 1
        }

        print("[NetworkScannerService]    ✓ Disconnected \(disconnectedCount) other camera(s)")
    }

    /// Disconnect ALL discovered cameras
    /// Call this when navigating away without selection
    func disconnectAllCameras() async {
        print("[NetworkScannerService] 🔌 disconnectAllCameras() - \(discoveredCameras.count) cameras")

        for camera in discoveredCameras {
            print("[NetworkScannerService]    Disconnecting: \(camera.name) (\(camera.ipAddress))")
            await camera.disconnect()
        }

        print("[NetworkScannerService]    ✓ All cameras disconnected")
    }

    /// Close all connections and reset state
    /// Call this when completely leaving the discovery flow
    func cleanup() {
        print("[NetworkScannerService] 🧹 cleanup() - full reset")

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
                print("[NetworkScannerService]    ✓ Cleanup complete")
            }
        } else {
            print("[NetworkScannerService]    ✓ No cameras to cleanup")
        }
    }

    // MARK: - Private Methods

    /// Perform the actual network scan - ALL IPs IN PARALLEL
    private func performScan() async {
        let totalIPs = scanRange.count
        print("[NetworkScannerService] 🔍 Starting parallel scan of \(totalIPs) IPs (.2-.20)")

        // Track completed count for progress
        var completedCount = 0

        // Scan ALL IPs in parallel using TaskGroup
        await withTaskGroup(of: DiscoveredCamera?.self) { group in
            // Launch all scans simultaneously
            for lastOctet in scanRange {
                let ip = "\(hotspotSubnet).\(lastOctet)"

                group.addTask {
                    print("[NetworkScannerService] 📡 Scanning \(ip)...")
                    let result = await self.scanIP(ip)

                    if let camera = result {
                        print("[NetworkScannerService] ✅ FOUND camera at \(ip): \(camera.name)")
                    } else {
                        print("[NetworkScannerService] ❌ No camera at \(ip)")
                    }

                    return result
                }
            }

            // Collect results as they complete
            for await result in group {
                completedCount += 1

                // Update progress
                let progress = Double(completedCount) / Double(totalIPs)
                state = .scanning(progress: progress)
                currentScanIP = "Scanned \(completedCount)/\(totalIPs)"

                // If camera found, add to list immediately
                if let camera = result {
                    discoveredCameras.append(camera)
                }

                // Check for cancellation
                if Task.isCancelled {
                    print("[NetworkScannerService] ⚠️ Scan cancelled")
                    group.cancelAll()
                    state = .idle
                    return
                }
            }
        }

        // Scan complete
        currentScanIP = ""
        state = .completed(cameraCount: discoveredCameras.count)
        print("[NetworkScannerService] 🏁 Scan complete! Found \(discoveredCameras.count) camera(s)")
    }

    /// Scan a single IP address for a camera
    /// Returns DiscoveredCamera if found, nil otherwise
    ///
    /// Cancellation behavior:
    /// - Stages 1-4: Check for cancellation, cleanup and return nil
    /// - Stage 5 (Session prep): COMMIT POINT - complete even if cancelled, return result
    ///
    /// - Parameter ip: IP address to scan
    /// - Returns: DiscoveredCamera if camera found, nil otherwise
    private func scanIP(_ ip: String) async -> DiscoveredCamera? {
        // Track resources for cleanup
        var commandConnection: NWConnection?
        var eventConnection: NWConnection?

        // Cleanup helper - cancels connections but NOT sessions
        func cleanupConnections() {
            commandConnection?.cancel()
            eventConnection?.cancel()
        }

        // === STAGE 1: TCP Connect (Command Channel) ===
        guard !Task.isCancelled else {
            print("[Scanner:\(ip)] ⏹ Cancelled before TCP connect")
            return nil
        }

        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: ptpipPort)!
        commandConnection = NWConnection(host: host, port: port, using: .tcp)
        commandConnection?.start(queue: .main)

        do {
            try await waitForConnection(commandConnection!, timeout: perIPTimeout)
            print("[Scanner:\(ip)] TCP connected")
        } catch {
            cleanupConnections()
            return nil
        }

        // === STAGE 2: Init Command Handshake ===
        guard !Task.isCancelled else {
            print("[Scanner:\(ip)] ⏹ Cancelled after TCP connect")
            cleanupConnections()
            return nil
        }

        do {
            // Send Init Command Request
            let initRequest = PTPIPInitCommandRequest(guid: persistentGUID, hostName: hostName)
            try await sendData(connection: commandConnection!, data: initRequest.toData())
            print("[Scanner:\(ip)] Sent InitCommandRequest")

            // Receive Init Command Ack
            let ackHeaderData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: 8,
                timeout: perIPTimeout
            )

            guard let header = PTPIPHeader.from(ackHeaderData),
                  header.type == PTPIPPacketType.initCommandAck.rawValue else {
                print("[Scanner:\(ip)] Invalid or wrong packet type")
                cleanupConnections()
                return nil
            }
            print("[Scanner:\(ip)] Got InitCommandAck")

            // Read payload
            let payloadLength = Int(header.length) - 8
            let payloadData = try await receiveWithTimeout(
                connection: commandConnection!,
                length: payloadLength,
                timeout: perIPTimeout
            )

            guard payloadData.count >= 4 else {
                print("[Scanner:\(ip)] Payload too short")
                cleanupConnections()
                return nil
            }

            let connectionNumber = payloadData.withUnsafeBytes {
                UInt32(littleEndian: $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self))
            }
            print("[Scanner:\(ip)] ConnectionNumber: \(connectionNumber)")

            // Extract camera name
            var cameraName = "Unknown Camera"
            if payloadData.count >= 20 {
                let nameData = payloadData.dropFirst(20)
                if let name = String(data: nameData, encoding: .utf16LittleEndian)?
                    .trimmingCharacters(in: .controlCharacters), !name.isEmpty {
                    cameraName = name
                }
            }
            print("[Scanner:\(ip)] Camera name: \(cameraName)")

            // === STAGE 3: TCP Connect (Event Channel) ===
            guard !Task.isCancelled else {
                print("[Scanner:\(ip)] ⏹ Cancelled before event channel")
                cleanupConnections()
                return nil
            }

            eventConnection = NWConnection(host: host, port: port, using: .tcp)
            eventConnection?.start(queue: .main)

            try await waitForConnection(eventConnection!, timeout: perIPTimeout)
            print("[Scanner:\(ip)] Event channel TCP connected")

            // === STAGE 4: Init Event Handshake ===
            guard !Task.isCancelled else {
                print("[Scanner:\(ip)] ⏹ Cancelled before event handshake")
                cleanupConnections()
                return nil
            }

            let eventRequest = PTPIPInitEventRequest(connectionNumber: connectionNumber)
            try await sendData(connection: eventConnection!, data: eventRequest.toData())
            print("[Scanner:\(ip)] Sent InitEventRequest")

            let eventAckHeaderData = try await receiveWithTimeout(
                connection: eventConnection!,
                length: 8,
                timeout: perIPTimeout
            )

            guard let eventAckHeader = PTPIPHeader.from(eventAckHeaderData),
                  eventAckHeader.type == PTPIPPacketType.initEventAck.rawValue else {
                print("[Scanner:\(ip)] Event channel handshake failed")
                cleanupConnections()
                return nil
            }
            print("[Scanner:\(ip)] Got InitEventAck - HANDSHAKE COMPLETE ✓")

            // === STAGE 5: Prepare Session (COMMIT POINT) ===
            // Once we reach here, we FINISH session setup even if cancelled.
            // A successfully prepared session is valuable - don't throw it away!
            print("[Scanner:\(ip)] 🔒 COMMIT POINT - preparing session (will complete even if cancelled)")

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
                let wasCancelled = Task.isCancelled
                print("[Scanner:\(ip)] ✅ Session prepared (cancelled=\(wasCancelled)) - returning camera")

                return DiscoveredCamera(
                    name: cameraName,
                    ipAddress: ip,
                    connectionNumber: connectionNumber,
                    session: session
                )

            } catch {
                // Session preparation failed - clean up everything
                print("[Scanner:\(ip)] ❌ Session preparation failed: \(error.localizedDescription)")
                await session.disconnect()
                cleanupConnections()
                return nil
            }

        } catch {
            // Any error in stages 2-4 - clean up
            cleanupConnections()
            return nil
        }
    }

    /// Wait for NWConnection to reach ready state
    private func waitForConnection(_ connection: NWConnection, timeout: TimeInterval) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    var resumed = false
                    connection.stateUpdateHandler = { state in
                        guard !resumed else { return }
                        switch state {
                        case .ready:
                            resumed = true
                            continuation.resume()
                        case .failed(let error):
                            resumed = true
                            continuation.resume(throwing: error)
                        case .cancelled:
                            resumed = true
                            continuation.resume(throwing: CancellationError())
                        default:
                            break
                        }
                    }
                }
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw NetworkScannerError.timeout
            }

            // Wait for first to complete
            _ = try await group.next()!
            group.cancelAll()
        }
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
