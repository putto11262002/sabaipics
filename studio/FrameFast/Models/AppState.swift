//
//  AppState.swift
//  FrameFast
//
//  Created: 2026-01-18
//  Updated: 2026-01-19 - Transfer Session Architecture
//
//  App-level state that determines which view to show in ContentView.
//  Simplified state machine with clear transitions.
//

import Foundation

/// App-level state that determines which view to show
///
/// State Machine:
/// ```
/// manufacturerSelection → hotspotSetup → discovering ─┬→ transferring
///                                      ↘ manualIPEntry → connecting ─┘
///                                                                    ↓
///                                                            [disconnect]
///                                                                    ↓
///                                                      manufacturerSelection
/// ```
///
/// States:
/// - manufacturerSelection: Choose camera brand (Canon/Nikon/Sony)
/// - hotspotSetup: Instructions to enable Personal Hotspot
/// - discovering: Network scan for cameras (CameraDiscoveryView)
/// - manualIPEntry: Manual IP address entry (WiFiSetupView)
/// - connecting: Connection in progress (ConnectingView)
/// - transferring: Active photo transfer session (LiveCaptureView)
/// - error: Error state with message
///
/// LEGACY: Capture is now a dedicated tab (`CaptureTabRootView`).
@available(*, deprecated, message: "Legacy app-level capture state. Capture is now driven by Capture tab flow.")
enum AppState: Equatable {
    /// Choose camera manufacturer (Canon/Nikon/Sony)
    case manufacturerSelection

    /// Setup instructions for Personal Hotspot
    case hotspotSetup

    /// Scanning network for cameras
    case discovering

    /// Manual IP address entry (fallback)
    case manualIPEntry

    /// Connecting to camera (shows progress)
    case connecting(ip: String)

    /// Active transfer session (main capture view)
    /// Associated capture session is managed by CaptureSessionStore
    case transferring

    /// Error state with message
    case error(String)

    // MARK: - Equatable

    static func == (lhs: AppState, rhs: AppState) -> Bool {
        switch (lhs, rhs) {
        case (.manufacturerSelection, .manufacturerSelection),
             (.hotspotSetup, .hotspotSetup),
             (.discovering, .discovering),
             (.manualIPEntry, .manualIPEntry),
             (.transferring, .transferring):
            return true
        case let (.connecting(lhsIP), .connecting(rhsIP)):
            return lhsIP == rhsIP
        case let (.error(lhsMsg), .error(rhsMsg)):
            return lhsMsg == rhsMsg
        default:
            return false
        }
    }
}

// MARK: - State Helpers

extension AppState {
    /// Whether this state should show the back button
    var showsBackButton: Bool {
        switch self {
        case .hotspotSetup, .discovering, .manualIPEntry, .connecting:
            return true
        default:
            return false
        }
    }

    /// Whether this state is a "connecting" type state
    var isConnecting: Bool {
        switch self {
        case .connecting:
            return true
        default:
            return false
        }
    }

    /// Whether this state is the active transfer state
    var isTransferring: Bool {
        switch self {
        case .transferring:
            return true
        default:
            return false
        }
    }

    /// Human-readable description for debugging
    var debugDescription: String {
        switch self {
        case .manufacturerSelection:
            return "manufacturerSelection"
        case .hotspotSetup:
            return "hotspotSetup"
        case .discovering:
            return "discovering"
        case .manualIPEntry:
            return "manualIPEntry"
        case .connecting(let ip):
            return "connecting(\(ip))"
        case .transferring:
            return "transferring"
        case .error(let msg):
            return "error(\(msg))"
        }
    }
}
