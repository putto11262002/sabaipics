//
//  LocalNetworkPermissionChecker.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-15
//  Pre-flight permission check for iOS local network access
//

import Foundation
import Network

/// Utility class to trigger and track iOS local network permission
class LocalNetworkPermissionChecker {

    /// Triggers iOS local network permission prompt
    /// - Parameter completion: Called when check completes (5s max timeout)
    static func triggerPermissionPrompt(completion: @escaping () -> Void) {
        print("🔐 [LocalNetworkPermissionChecker] Triggering permission prompt...")

        // Connect to link-local broadcast to trigger iOS permission
        let connection = NWConnection(
            host: "169.254.255.255", // Link-local broadcast (RFC 3927)
            port: 1,
            using: .udp
        )

        var hasCompleted = false

        connection.stateUpdateHandler = { state in
            guard !hasCompleted else { return }

            switch state {
            case .ready, .failed, .cancelled:
                hasCompleted = true
                connection.cancel()

                print("✅ [LocalNetworkPermissionChecker] Permission check completed: \(state)")

                // Give iOS time to process permission grant
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    completion()
                }

            case .waiting, .preparing, .setup:
                break

            @unknown default:
                break
            }
        }

        connection.start(queue: .global(qos: .userInitiated))

        // Safety timeout: complete after 5 seconds
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0) {
            guard !hasCompleted else { return }
            hasCompleted = true
            connection.cancel()

            print("⏱️ [LocalNetworkPermissionChecker] Permission check timeout (5s)")
            DispatchQueue.main.async {
                completion()
            }
        }
    }

    /// Check if permission was previously granted (heuristic)
    static func likelyHasPermission() -> Bool {
        return UserDefaults.standard.bool(forKey: "LocalNetworkPermissionGranted")
    }

    /// Mark permission as granted (call after successful connection)
    static func markPermissionGranted() {
        print("✅ [LocalNetworkPermissionChecker] Marking permission as granted")
        UserDefaults.standard.set(true, forKey: "LocalNetworkPermissionGranted")
    }
}
