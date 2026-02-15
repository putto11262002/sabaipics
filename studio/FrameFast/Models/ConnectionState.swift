//
//  ConnectionState.swift
//  FrameFast
//
//  Created: 2026-01-18
//  Phase 2: Architecture Refactoring - Connection State Enum
//

import Foundation

/// Represents the connection state of the camera
/// Focused on connection concerns only (extracted from AppState)
enum ConnectionState: Equatable {
    case idle                    // Waiting for user input
    case connecting              // Connection in progress
    case connected               // Successfully connected
    case error(String)           // Connection error with message
}
