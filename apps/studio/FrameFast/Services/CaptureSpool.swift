//  CaptureSpool.swift
//  FrameFast
//
//  Created: 2026-02-08
//  Local staging area for captured photos.
//

import Foundation

/// Local staging area (spool) for captured photos.
///
/// Default location: Library/Application Support (reliable; app-controlled purge).
///
/// Note: we explicitly exclude the spool directory from iCloud backup.
///
/// The spool is intentionally separate from UI retention:
/// - UI may keep only the last N photos in memory.
/// - Spool may keep files until upload completes or user clears them.
actor CaptureSpool {
    struct Item: Sendable {
        let id: UUID
        let url: URL
        let filename: String
        let createdAt: Date
        let bytes: Int
    }

    private let fileManager: FileManager
    private let baseDirectory: URL
    private let sessionID: UUID
    private var didCreateSessionDirectory = false

    init(fileManager: FileManager = .default, sessionID: UUID = UUID()) {
        self.fileManager = fileManager
        self.sessionID = sessionID

        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.baseDirectory = appSupport
            .appendingPathComponent("framefast", isDirectory: true)
            .appendingPathComponent("capture-spool", isDirectory: true)
            .appendingPathComponent(sessionID.uuidString, isDirectory: true)
    }

    func store(data: Data, preferredFilename: String, handleHex: String? = nil) throws -> Item {
        try ensureSessionDirectory()

        let createdAt = Date()
        let sanitized = sanitizeFilename(preferredFilename)
        let stamp = CaptureSpool.timestampString(createdAt)
        let handlePart = (handleHex?.isEmpty == false) ? "-\(handleHex!)" : ""

        // Avoid path traversal / weird names; keep extension if present.
        let finalName = "\(stamp)\(handlePart)-\(sanitized)"
        let url = baseDirectory.appendingPathComponent(finalName, isDirectory: false)

        try data.write(to: url, options: [.atomic])

        return Item(
            id: UUID(),
            url: url,
            filename: sanitized,
            createdAt: createdAt,
            bytes: data.count
        )
    }

    func deleteFile(at url: URL) throws {
        try fileManager.removeItem(at: url)
    }

    func deleteSession() throws {
        if fileManager.fileExists(atPath: baseDirectory.path) {
            try fileManager.removeItem(at: baseDirectory)
        }
        didCreateSessionDirectory = false
    }

    func sessionDirectory() -> URL {
        baseDirectory
    }

    private func ensureSessionDirectory() throws {
        guard !didCreateSessionDirectory else { return }
        try fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
        try excludeFromBackup(directory: baseDirectory)
        didCreateSessionDirectory = true
    }

    private func excludeFromBackup(directory: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try url.setResourceValues(values)
    }

    private func sanitizeFilename(_ input: String) -> String {
        var name = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            name = "photo.jpg"
        }
        name = name.replacingOccurrences(of: "/", with: "-")
        name = name.replacingOccurrences(of: "\\", with: "-")
        name = name.replacingOccurrences(of: ":", with: "-")
        return name
    }

    private static func timestampString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f.string(from: date)
    }
}
