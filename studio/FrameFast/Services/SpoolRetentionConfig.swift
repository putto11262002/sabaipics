//  SpoolRetentionConfig.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import Foundation

/// Retention configuration for local spool files.
///
/// Hardcoded constants now; structured for future user settings.
enum SpoolRetentionConfig {
    /// How long completed upload files stay on disk before cleanup.
    static let completedRetention: TimeInterval = 7 * 24 * 60 * 60 // 7 days

    /// How long terminal-failed upload files stay on disk before cleanup.
    static let terminalFailedRetention: TimeInterval = 7 * 24 * 60 * 60 // 7 days

    /// Minimum interval between automatic cleanup runs.
    static let cleanupInterval: TimeInterval = 6 * 60 * 60 // 6 hours

    /// UserDefaults key for tracking last automatic cleanup time.
    static let lastCleanupKey = "SpoolLastCleanupAt"
}
