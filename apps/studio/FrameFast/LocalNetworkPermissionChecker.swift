//
//  LocalNetworkPermissionChecker.swift
//  FrameFast
//
//  Created: 2026-01-15
//  Pre-flight permission check for iOS local network access
//

import Foundation
import Network

/// Utility class to trigger and track iOS local network permission
class LocalNetworkPermissionChecker {

    enum LocalNetworkPermissionState: Equatable {
        case unknown
        case granted
        case denied
    }

    /// Probe local network permission using a real Bonjour browse.
    ///
    /// This intentionally avoids heuristics like "we asked once" or "we think it's granted".
    /// If iOS denies local network access, Network.framework typically fails the operation with a
    /// policy error (e.g. DNS-SD `kDNSServiceErr_PolicyDenied`).
    static func probePermission(timeout: TimeInterval = 5.0) async -> LocalNetworkPermissionState {
        await withCheckedContinuation { (continuation: CheckedContinuation<LocalNetworkPermissionState, Never>) in
            let queue = DispatchQueue.global(qos: .userInitiated)

            final class Once: @unchecked Sendable {
                private var didRun = false
                private let lock = NSLock()
                func run(_ block: () -> Void) {
                    lock.lock()
                    defer { lock.unlock() }
                    guard !didRun else { return }
                    didRun = true
                    block()
                }
            }

            let once = Once()

            let finish: @Sendable (LocalNetworkPermissionState) -> Void = { result in
                once.run {
                    continuation.resume(returning: result)
                }
            }

            let parameters = NWParameters.tcp
            parameters.includePeerToPeer = true

            // Must match a service type declared in NSBonjourServices.
            let browser = NWBrowser(for: .bonjour(type: "_ptpip._tcp", domain: nil), using: parameters)

            browser.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("[LocalNetworkPermissionChecker] Local network permission probe ready")
                    finish(.granted)
                case .failed(let error):
                    let denied = isDeniedError(error)
                    print("[LocalNetworkPermissionChecker] Local network permission probe failed: \(error) (denied=\(denied))")
                    finish(denied ? .denied : .unknown)
                case .waiting(let error):
                    let denied = isDeniedError(error)
                    print("[LocalNetworkPermissionChecker] Local network permission probe waiting: \(error) (denied=\(denied))")
                    if denied {
                        finish(.denied)
                    }
                case .cancelled:
                    finish(.unknown)
                case .setup:
                    break
                @unknown default:
                    break
                }
            }

            browser.start(queue: queue)

            queue.asyncAfter(deadline: .now() + timeout) {
                print("[LocalNetworkPermissionChecker] Local network permission probe timeout (\(timeout)s)")
                browser.cancel()
                finish(.unknown)
            }
        }
    }

    private static func isDeniedError(_ error: NWError) -> Bool {
        switch error {
        case .posix(let code):
            return code == .EPERM || code == .EACCES
        case .dns(let code):
            // Common policy denial value: kDNSServiceErr_PolicyDenied (-65570)
            return code == -65570
        default:
            return false
        }
    }
}
