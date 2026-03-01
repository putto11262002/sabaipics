//  SpoolFileService.swift
//  FrameFast
//
//  Created: 2026-03-01
//  Single owner of all spool filesystem operations.
//

import Foundation

/// Centralised file service for the local photo spool.
///
/// All spool filesystem interactions — writing, deleting, scanning,
/// directory management, and disk usage stats — go through this actor.
///
/// Created once at app startup in `AppCoordinator` and shared
/// with the capture pipeline, storage UI, and cleanup orchestration.
actor SpoolFileService {
    struct Item: Sendable {
        let id: UUID
        let url: URL
        let filename: String
        let createdAt: Date
        let bytes: Int
    }

    /// Fallback directory name when no event is selected.
    static let unassignedEventId = "_unassigned"

    private let fileManager: FileManager
    private let root: URL
    private var ensuredDirectories: Set<String> = []

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.root = Self.spoolRoot(fileManager: fileManager)
    }

    // MARK: - Path accessors

    /// Returns the root `capture-spool/` directory.
    static func spoolRoot(fileManager: FileManager = .default) -> URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport
            .appendingPathComponent("framefast", isDirectory: true)
            .appendingPathComponent("capture-spool", isDirectory: true)
    }

    /// Returns the directory for a specific event.
    func eventDirectory(eventId: String) -> URL {
        root.appendingPathComponent(eventId, isDirectory: true)
    }

    // MARK: - Write

    func store(data: Data, eventId: String, preferredFilename: String, handleHex: String? = nil) throws -> Item {
        try ensureEventDirectory(eventId: eventId)

        let createdAt = Date()
        let sanitized = sanitizeFilename(preferredFilename)
        let stamp = Self.timestampString(createdAt)
        let handlePart = (handleHex?.isEmpty == false) ? "-\(handleHex!)" : ""

        let finalName = "\(stamp)\(handlePart)-\(sanitized)"
        let dir = eventDirectory(eventId: eventId)
        let url = dir.appendingPathComponent(finalName, isDirectory: false)

        try data.write(to: url, options: [.atomic])

        return Item(
            id: UUID(),
            url: url,
            filename: sanitized,
            createdAt: createdAt,
            bytes: data.count
        )
    }

    // MARK: - Delete

    func deleteFile(at url: URL) throws {
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    func deleteFiles(at urls: [URL]) {
        for url in urls {
            do {
                try deleteFile(at: url)
            } catch {
                print("[SpoolFileService] Failed to delete \(url.lastPathComponent): \(error)")
            }
        }
    }

    // MARK: - Directory management

    func removeEventDirectory(eventId: String) throws {
        let dir = eventDirectory(eventId: eventId)
        if fileManager.fileExists(atPath: dir.path) {
            try fileManager.removeItem(at: dir)
        }
        ensuredDirectories.remove(eventId)
    }

    func removeEmptyEventDirectories() {
        guard fileManager.fileExists(atPath: root.path) else { return }

        do {
            let contents = try fileManager.contentsOfDirectory(
                at: root,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )

            for dir in contents {
                var isDir: ObjCBool = false
                guard fileManager.fileExists(atPath: dir.path, isDirectory: &isDir),
                      isDir.boolValue else { continue }

                let children = try fileManager.contentsOfDirectory(atPath: dir.path)
                if children.isEmpty {
                    try fileManager.removeItem(at: dir)
                    ensuredDirectories.remove(dir.lastPathComponent)
                    print("[SpoolFileService] Removed empty directory: \(dir.lastPathComponent)")
                }
            }
        } catch {
            print("[SpoolFileService] Failed to scan event directories: \(error)")
        }
    }

    // MARK: - Stats

    func diskUsage() -> Int64 {
        guard fileManager.fileExists(atPath: root.path) else { return 0 }

        var total: Int64 = 0

        if let enumerator = fileManager.enumerator(
            at: root,
            includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) {
            for case let fileURL as URL in enumerator {
                guard let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
                      values.isRegularFile == true,
                      let size = values.fileSize else { continue }
                total += Int64(size)
            }
        }

        return total
    }

    // MARK: - Internals

    private func ensureEventDirectory(eventId: String) throws {
        guard !ensuredDirectories.contains(eventId) else { return }
        let dir = eventDirectory(eventId: eventId)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        try excludeFromBackup(directory: dir)
        ensuredDirectories.insert(eventId)
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
