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
/// - manufacturerSelection: ManufacturerSelectionView - choose camera brand (SAB-22)
/// - idle: CameraDiscoveryView - discovering cameras (SAB-22 will show this after manufacturer selected)
/// - cameraFound: USB legacy (disabled, kept for compatibility)
/// - connecting: ConnectingView - connection in progress
/// - connected: ConnectedView - success celebration
/// - ready: USB legacy (might not be used)
/// - capturing: LiveCaptureView - active photo capture
/// - error: ConnectionErrorView - error state
enum AppState: Equatable {
    case manufacturerSelection       // ManufacturerSelectionView - choose camera brand (SAB-22)
    case idle                        // CameraDiscoveryView - discovering cameras (updated in SAB-22)
    case cameraFound(ICCameraDevice)  // USB legacy
    case connecting                   // ConnectingView (Phase 5)
    case connected                    // ConnectedView (Phase 5, 1s pause)
    case ready                        // USB legacy
    case capturing                    // LiveCaptureView
    case error(String)                // ConnectionErrorView

    static func == (lhs: AppState, rhs: AppState) -> Bool {
        switch (lhs, rhs) {
        case (.manufacturerSelection, .manufacturerSelection),
             (.idle, .idle),
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
