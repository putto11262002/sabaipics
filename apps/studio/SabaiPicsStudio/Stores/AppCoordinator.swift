//
//  AppCoordinator.swift
//  SabaiPicsStudio
//
//  App-level coordinator holding initialization state.
//  Transfer sessions are owned by CaptureSessionStore (not here).
//

import SwiftUI

@MainActor
class AppCoordinator: ObservableObject {

    /// Tracks if app initialization is complete (Clerk load + minimum 2s display)
    @Published var appInitialized = false
}
