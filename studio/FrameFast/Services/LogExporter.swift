//
//  LogExporter.swift
//  FrameFast
//
//  Created: 2026-01-29
//  Production log export for field debugging (SAB-82)
//  Uses OSLogStore to export PTP/IP logs from device
//

import Foundation
import OSLog

// MARK: - Log Exporter

/// Exports OSLog entries for PTP/IP debugging
/// Use this to export logs from production devices for troubleshooting
class LogExporter {

    // MARK: - Export Configuration

    /// Export logs from specific subsystem
    private static let subsystem = "com.framefast.studio"

    // MARK: - Export Methods

    /// Export logs from last N seconds
    /// - Parameter timeInterval: How far back to export (in seconds, negative value)
    ///   Example: -3600 = last hour, -300 = last 5 minutes
    /// - Returns: URL to exported log file (in temp directory)
    @available(iOS 15.0, *)
    static func exportLogs(timeInterval: TimeInterval = -3600) async throws -> URL {
        // Get OSLog store for current process
        let store = try OSLogStore(scope: .currentProcessIdentifier)

        // Calculate time position
        let position = store.position(timeIntervalSinceLatestBoot: timeInterval)

        // Collect entries
        var logLines: [String] = []

        // Add header
        let timestamp = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"

        logLines.append("=== FrameFast PTP/IP Logs ===")
        logLines.append("Export Time: \(formatter.string(from: timestamp))")
        logLines.append("Time Range: Last \(abs(Int(timeInterval))) seconds")
        logLines.append("Subsystem: \(subsystem)")
        logLines.append("===================================\n")

        // Fetch and filter entries
        let entries = try store.getEntries(at: position)

        for entry in entries {
            // Filter by our subsystem
            guard let logEntry = entry as? OSLogEntryLog,
                  logEntry.subsystem == subsystem else {
                continue
            }

            // Format: [timestamp] [category] [level] message
            let timestamp = formatter.string(from: logEntry.date)
            let category = logEntry.category
            let level = levelString(for: logEntry.level)
            let message = logEntry.composedMessage

            logLines.append("[\(timestamp)] [\(category)] [\(level)] \(message)")
        }

        // Write to file
        let logText = logLines.joined(separator: "\n")

        let filename = "framefast-logs-\(Int(Date().timeIntervalSince1970)).txt"
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename)

        try logText.write(to: url, atomically: true, encoding: .utf8)

        return url
    }

    /// Export logs filtered by category
    /// - Parameters:
    ///   - category: Category to filter (e.g., "ptpip.network", "canon")
    ///   - timeInterval: How far back to export (in seconds, negative value)
    /// - Returns: URL to exported log file
    @available(iOS 15.0, *)
    static func exportLogs(category: String, timeInterval: TimeInterval = -3600) async throws -> URL {
        let store = try OSLogStore(scope: .currentProcessIdentifier)
        let position = store.position(timeIntervalSinceLatestBoot: timeInterval)

        var logLines: [String] = []

        // Add header
        let timestamp = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"

        logLines.append("=== FrameFast PTP/IP Logs (Category: \(category)) ===")
        logLines.append("Export Time: \(formatter.string(from: timestamp))")
        logLines.append("Time Range: Last \(abs(Int(timeInterval))) seconds")
        logLines.append("Subsystem: \(subsystem)")
        logLines.append("Category: \(category)")
        logLines.append("===================================\n")

        // Fetch and filter entries
        let entries = try store.getEntries(at: position)

        for entry in entries {
            // Filter by our subsystem and category
            guard let logEntry = entry as? OSLogEntryLog,
                  logEntry.subsystem == subsystem,
                  logEntry.category == category else {
                continue
            }

            // Format: [timestamp] [level] message
            let timestamp = formatter.string(from: logEntry.date)
            let level = levelString(for: logEntry.level)
            let message = logEntry.composedMessage

            logLines.append("[\(timestamp)] [\(level)] \(message)")
        }

        // Write to file
        let logText = logLines.joined(separator: "\n")

        let filename = "framefast-logs-\(category)-\(Int(Date().timeIntervalSince1970)).txt"
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename)

        try logText.write(to: url, atomically: true, encoding: .utf8)

        return url
    }

    // MARK: - Helper Methods

    /// Convert OSLogEntryLog.Level to readable string
    @available(iOS 15.0, *)
    private static func levelString(for level: OSLogEntryLog.Level) -> String {
        switch level {
        case .undefined: return "UNDEFINED"
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .notice: return "NOTICE"
        case .error: return "ERROR"
        case .fault: return "FAULT"
        @unknown default: return "UNKNOWN"
        }
    }
}
