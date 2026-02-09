//
//  PTPLogger.swift
//  FrameFast
//
//  Created: 2026-01-29
//  Structured logging for PTP/IP protocol debugging (SAB-82)
//  Based on gphoto2lib's 4-level logging system (ERROR/INFO/DEBUG/DATA)
//

import Foundation
import os.log

// MARK: - Log Level

/// PTP/IP logging severity levels (from gphoto2lib)
enum PTPLogLevel: Int, Comparable {
    case error = 0      // Production-safe: Errors only
    case info = 1       // Production: Key events (connect, disconnect, photo detected)
    case debug = 2      // Debug: Operation codes, state transitions, timing
    case data = 3       // Debug: Binary packet hexdumps (most verbose)

    static func < (lhs: PTPLogLevel, rhs: PTPLogLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

// MARK: - PTP Logger

/// Structured logger for PTP/IP protocol debugging
/// Uses OSLog for native iOS logging with category-based filtering
class PTPLogger {
    // MARK: - Configuration

    private static let subsystem = "com.framefast.studio"

    #if DEBUG
    // Debug builds: Enable all logging including hexdumps
    private static var enabledLevel: PTPLogLevel = .data
    #else
    // Production builds: Only info and errors
    private static var enabledLevel: PTPLogLevel = .info
    #endif

    // MARK: - Log Categories

    /// Network packet logging (send/receive, packet types)
    static let network = OSLog(subsystem: subsystem, category: "ptpip.network")

    /// PTP command execution (operation codes, response codes, timing)
    static let command = OSLog(subsystem: subsystem, category: "ptpip.command")

    /// Session lifecycle (connect, disconnect, state transitions)
    static let session = OSLog(subsystem: subsystem, category: "ptpip.session")

    /// Event monitoring (polling, push events, event parsing)
    static let event = OSLog(subsystem: subsystem, category: "ptpip.event")

    /// Canon-specific operations (GetEvent polling, event parsing)
    static let canon = OSLog(subsystem: subsystem, category: "canon")

    /// Sony-specific operations (SDIO, device props, in-memory capture)
    static let sony = OSLog(subsystem: subsystem, category: "ptpip.sony")

    // MARK: - Breadcrumb Trail

    private static let breadcrumbLock = NSLock()
    private static var breadcrumbs: [String] = []
    private static let maxBreadcrumbs = 20

    /// Add breadcrumb for error context tracking
    /// Records recent operations to provide context when errors occur
    static func breadcrumb(_ message: String) {
        breadcrumbLock.lock()
        defer { breadcrumbLock.unlock() }

        let timestamp = Date().timeIntervalSince1970
        breadcrumbs.append("[\(String(format: "%.3f", timestamp))] \(message)")

        if breadcrumbs.count > maxBreadcrumbs {
            breadcrumbs.removeFirst()
        }
    }

    /// Dump recent breadcrumbs for error context
    static func dumpBreadcrumbs() -> String {
        breadcrumbLock.lock()
        defer { breadcrumbLock.unlock() }

        if breadcrumbs.isEmpty {
            return "No recent operations"
        }

        return "Recent operations:\n" + breadcrumbs.joined(separator: "\n")
    }

    // MARK: - Level-Based Logging

    /// Log error message (always logged, even in production)
    /// - Parameters:
    ///   - message: Error message
    ///   - category: OSLog category (defaults to .default)
    ///   - file: Source file (auto-filled)
    ///   - line: Source line (auto-filled)
    static func error(_ message: String,
                     category: OSLog = .default,
                     file: String = #file,
                     line: Int = #line) {
        let filename = (file as NSString).lastPathComponent
        os_log(.error, log: category, "[%{public}@:%d] %{public}@",
               filename, line, message)

        // Add to breadcrumb trail
        breadcrumb("ERROR: \(message)")
    }

    /// Log info message (key events: connect, disconnect, photo detected)
    /// - Parameters:
    ///   - message: Info message
    ///   - category: OSLog category (defaults to .default)
    static func info(_ message: String, category: OSLog = .default) {
        guard enabledLevel >= .info else { return }
        os_log(.info, log: category, "%{public}@", message)
    }

    /// Log debug message (operation codes, state transitions, timing)
    /// - Parameters:
    ///   - message: Debug message
    ///   - category: OSLog category (defaults to .default)
    static func debug(_ message: String, category: OSLog = .default) {
        guard enabledLevel >= .debug else { return }
        os_log(.debug, log: category, "%{public}@", message)

        // Add to breadcrumb trail (for error context)
        breadcrumb("DEBUG: \(message)")
    }

    /// Log binary data with hexdump (most verbose level)
    /// - Parameters:
    ///   - bytes: Data to dump
    ///   - caption: Caption for hexdump
    ///   - category: OSLog category (defaults to .default)
    ///   - maxBytes: Maximum bytes to dump (defaults to 1024)
    static func data(_ bytes: Data,
                    caption: String,
                    category: OSLog = .default,
                    maxBytes: Int = 1024) {
        guard enabledLevel >= .data else { return }

        let hexdump = formatHexdump(bytes, maxBytes: maxBytes)
        os_log(.debug, log: category, "%{public}@:\n%{public}@", caption, hexdump)
    }

    // MARK: - Hexdump Formatter

    /// Format binary data as hexdump (gphoto2-style)
    /// Format: 16 bytes per line, offset in hex, hex dump (8+8 bytes), ASCII representation
    ///
    /// Example output:
    /// ```
    /// 0000  1E 00 00 00 06 00 00 00 - 01 00 00 00 16 91 10 00  ................
    /// 0010  00 00 01 00 20 00 00 00 - 00 00 00 00 00 00        .... .........
    /// ```
    ///
    /// - Parameters:
    ///   - data: Data to format
    ///   - maxBytes: Maximum bytes to format (defaults to 1024)
    /// - Returns: Formatted hexdump string
    static func formatHexdump(_ data: Data, maxBytes: Int = 1024) -> String {
        let bytes = data.prefix(maxBytes)
        var output = ""

        for offset in stride(from: 0, to: bytes.count, by: 16) {
            let endIndex = min(offset + 16, bytes.count)
            let chunk = bytes[offset..<endIndex]

            // Offset (4 hex digits)
            output += String(format: "%04X  ", offset)

            // Hex dump (16 bytes, split into 2 groups of 8)
            for (i, byte) in chunk.enumerated() {
                output += String(format: "%02X ", byte)
                if i == 7 {
                    output += "- "
                }
            }

            // Padding for incomplete lines
            let padding = 16 - chunk.count
            output += String(repeating: "   ", count: padding)
            if chunk.count <= 8 {
                output += "  "  // Extra padding if we didn't reach the separator
            }

            // ASCII representation
            output += " "
            for byte in chunk {
                let char: Character
                if byte >= 32 && byte <= 126 {
                    char = Character(UnicodeScalar(byte))
                } else {
                    char = "."
                }
                output += String(char)
            }

            output += "\n"
        }

        // Truncation notice
        if data.count > maxBytes {
            output += String(format: "... (showing first %d of %d bytes)\n",
                           maxBytes, data.count)
        }

        return output
    }

    // MARK: - Formatting Helpers

    /// Format byte size as "decimal = 0xhex bytes"
    /// Example: "512 = 0x200 bytes"
    static func formatSize(_ bytes: Int) -> String {
        return "\(bytes) = 0x\(String(format: "%X", bytes)) bytes"
    }

    /// Format duration in seconds with 3 decimal places
    /// Example: "0.042s"
    static func formatDuration(_ seconds: TimeInterval) -> String {
        return String(format: "%.3fs", seconds)
    }

    /// Format throughput in KB/s
    /// Example: "2415.7 KB/s"
    static func formatThroughput(bytes: Int, duration: TimeInterval) -> String {
        let kbps = Double(bytes) / duration / 1024.0
        return String(format: "%.1f KB/s", kbps)
    }

    /// Format hex value with 0x prefix
    /// Example: "0x9116" for UInt16, "0x00020001" for UInt32
    static func formatHex(_ value: UInt16) -> String {
        return String(format: "0x%04X", value)
    }

    static func formatHex(_ value: UInt32) -> String {
        return String(format: "0x%08X", value)
    }

    // MARK: - Runtime Configuration

    /// Set log level at runtime (for field debugging)
    /// - Parameter level: New log level
    static func setLevel(_ level: PTPLogLevel) {
        enabledLevel = level
        info("PTP log level set to: \(level)", category: session)
    }

    /// Get current log level
    static var currentLevel: PTPLogLevel {
        return enabledLevel
    }
}

// MARK: - Custom String Convertible

extension PTPLogLevel: CustomStringConvertible {
    var description: String {
        switch self {
        case .error: return "ERROR"
        case .info: return "INFO"
        case .debug: return "DEBUG"
        case .data: return "DATA"
        }
    }
}
