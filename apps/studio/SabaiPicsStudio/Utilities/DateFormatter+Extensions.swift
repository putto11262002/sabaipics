//
//  DateFormatter+Extensions.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-29
//

import Foundation

extension DateFormatter {
    static let iso8601: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()

    static let iso8601WithoutMillis: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()

    // PostgreSQL timestamp format with microseconds
    static let postgresTimestamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSSZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    static let mediumDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    static let mediumDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

extension RelativeDateTimeFormatter {
    static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()
}

extension String {
    func toDate() -> Date? {
        // Try standard ISO8601 formats first
        if let date = DateFormatter.iso8601.date(from: self) {
            return date
        }
        if let date = DateFormatter.iso8601WithoutMillis.date(from: self) {
            return date
        }
        // Try PostgreSQL timestamp format (from database)
        if let date = DateFormatter.postgresTimestamp.date(from: self) {
            return date
        }
        return nil
    }

    func formattedDate() -> String {
        guard let date = self.toDate() else { return self }
        return DateFormatter.mediumDate.string(from: date)
    }

    func formattedDateTime() -> String {
        guard let date = self.toDate() else { return self }
        return DateFormatter.mediumDateTime.string(from: date)
    }

    func relativeTime() -> String {
        guard let date = self.toDate() else {
            print("[DateFormatter Error] Failed to parse date from: \(self)")
            return self
        }

        // Use RelativeDateTimeFormatter (available iOS 13+)
        if #available(iOS 13.0, *) {
            return RelativeDateTimeFormatter.relative.localizedString(for: date, relativeTo: Date())
        } else {
            // Fallback for iOS 12 and earlier - show formatted date
            return DateFormatter.mediumDate.string(from: date)
        }
    }
}
