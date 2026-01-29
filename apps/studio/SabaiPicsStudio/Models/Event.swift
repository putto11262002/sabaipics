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
