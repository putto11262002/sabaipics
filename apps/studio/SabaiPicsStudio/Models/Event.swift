//
//  Event.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-29
//

import Foundation

struct Event: Identifiable, Codable {
    let id: String
    let name: String
    let subtitle: String?
    let logoUrl: String?
    let startDate: String?
    let endDate: String?
    let createdAt: String
    let expiresAt: String
}

struct EventsResponse: Codable {
    let data: [Event]
    let pagination: Pagination
}

struct Pagination: Codable {
    let page: Int
    let limit: Int
    let totalCount: Int
    let totalPages: Int
    let hasNextPage: Bool
    let hasPrevPage: Bool
}

struct EventResponse: Codable {
    let data: Event
}

// MARK: - Placeholder for Skeleton Loading

extension Event {
    static var placeholder: Event {
        Event(
            id: "placeholder_id",
            name: "Loading Event Name",
            subtitle: "Loading subtitle text here",
            logoUrl: nil,
            startDate: "2026-01-01T00:00:00.000+07:00",
            endDate: "2026-01-01T00:00:00.000+07:00",
            createdAt: "2026-01-01T00:00:00.000+07:00",
            expiresAt: "2026-01-01T00:00:00.000+07:00"
        )
    }

    static var placeholders: [Event] {
        (0..<5).map { index in
            Event(
                id: "placeholder_\(index)",
                name: "Loading Event Name",
                subtitle: "Loading subtitle",
                logoUrl: nil,
                startDate: "2026-01-01T00:00:00.000+07:00",
                endDate: "2026-01-01T00:00:00.000+07:00",
                createdAt: "2026-01-01T00:00:00.000+07:00",
                expiresAt: "2026-01-01T00:00:00.000+07:00"
            )
        }
    }
}
