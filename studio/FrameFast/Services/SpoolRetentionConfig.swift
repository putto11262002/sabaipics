//  SpoolRetentionConfig.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import Foundation

/// Retention configuration for local spool files.
enum SpoolRetentionConfig {
    enum Period: String, CaseIterable {
        case sevenDays = "7d"
        case thirtyDays = "30d"

        var timeInterval: TimeInterval {
            switch self {
            case .sevenDays: return 7 * 24 * 60 * 60
            case .thirtyDays: return 30 * 24 * 60 * 60
            }
        }

        var displayName: String {
            switch self {
            case .sevenDays: return "7 days"
            case .thirtyDays: return "30 days"
            }
        }
    }

    private static let periodKey = "SpoolRetentionPeriod"

    static var period: Period {
        get {
            guard let raw = UserDefaults.standard.string(forKey: periodKey),
                  let value = Period(rawValue: raw) else { return .sevenDays }
            return value
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: periodKey)
        }
    }

    /// How long completed upload files stay on disk before cleanup.
    static var completedRetention: TimeInterval { period.timeInterval }

    /// How long terminal-failed upload files stay on disk before cleanup.
    static var terminalFailedRetention: TimeInterval { period.timeInterval }

    /// Minimum interval between automatic cleanup runs.
    static let cleanupInterval: TimeInterval = 6 * 60 * 60 // 6 hours

    /// UserDefaults key for tracking last automatic cleanup time.
    static let lastCleanupKey = "SpoolLastCleanupAt"
}
