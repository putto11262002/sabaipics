//
//  AppState.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Phase 5: Architecture Refactoring - AppState Extraction
//
//  App-level state that determines which view to show in ContentView.
//  Extracted from CameraViewModel.swift during Phase 5 cleanup.
//

import Foundation
import ImageCaptureCore

/// App-level state that determines which view to show
///
/// States:
/// - idle: WiFiSetupView - waiting for user input
/// - cameraFound: USB legacy (disabled, kept for compatibility)
/// - connecting: ConnectingView - connection in progress
/// - connected: ConnectedView - success celebration
/// - ready: USB legacy (might not be used)
/// - capturing: LiveCaptureView - active photo capture
/// - error: ConnectionErrorView - error state
enum AppState: Equatable {
    case idle                        // WiFiSetupView - waiting for user input
    case cameraFound(ICCameraDevice)  // USB legacy
    case connecting                   // ConnectingView (Phase 5)
    case connected                    // ConnectedView (Phase 5, 1s pause)
    case ready                        // USB legacy
    case capturing                    // LiveCaptureView
    case error(String)                // ConnectionErrorView

    static func == (lhs: AppState, rhs: AppState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle),
             (.connecting, .connecting),
             (.connected, .connected),
             (.ready, .ready),
             (.capturing, .capturing):
            return true
        case let (.error(lhsMsg), .error(rhsMsg)):
            return lhsMsg == rhsMsg
        case let (.cameraFound(lhsCam), .cameraFound(rhsCam)):
            return lhsCam.name == rhsCam.name
        default:
            return false
        }
    }
}
