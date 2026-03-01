//
//  Event.swift
//  FrameFast
//
//  Created: 2026-01-29
//

import Foundation

struct Event: Identifiable, Codable, Hashable {
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

// MARK: - Update Input

struct UpdateEventInput: Codable {
    let name: String?
    let subtitle: String?
}

// MARK: - FTP Credentials (bare response — no `data` wrapper)

struct FtpCredentials: Codable {
    let id: String
    let username: String
    let expiresAt: String
    let createdAt: String
}

struct FtpRevealData: Codable {
    let username: String
    let password: String
}

// MARK: - Image Pipeline

struct ImagePipelineResponse: Codable {
    let data: ImagePipelineSettings
}

struct ImagePipelineSettings: Codable {
    let autoEdit: Bool
    let autoEditPresetId: String?
    let autoEditIntensity: Int
    let lutId: String?
    let lutIntensity: Int
    let includeLuminance: Bool
}

struct UpdateImagePipelineInput: Encodable {
    let autoEdit: Bool
    let autoEditPresetId: String?
    let autoEditIntensity: Int
    let lutId: String?
    let lutIntensity: Int
    let includeLuminance: Bool

    // Swift's default Codable skips nil keys entirely (undefined in JSON).
    // The API requires all keys present — nullable fields must encode as null.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(autoEdit, forKey: .autoEdit)
        try container.encode(autoEditPresetId, forKey: .autoEditPresetId)
        try container.encode(autoEditIntensity, forKey: .autoEditIntensity)
        try container.encode(lutId, forKey: .lutId)
        try container.encode(lutIntensity, forKey: .lutIntensity)
        try container.encode(includeLuminance, forKey: .includeLuminance)
    }

    private enum CodingKeys: String, CodingKey {
        case autoEdit, autoEditPresetId, autoEditIntensity
        case lutId, lutIntensity, includeLuminance
    }
}

// MARK: - Auto-Edit Presets

struct AutoEditPresetsResponse: Codable {
    let data: [AutoEditPreset]
}

struct AutoEditPreset: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let isBuiltin: Bool
    let contrast: Double
    let brightness: Double
    let saturation: Double
    let sharpness: Double
    let autoContrast: Bool
    let createdAt: String
}

// MARK: - Studio LUTs

struct StudioLutsResponse: Codable {
    let data: [StudioLut]
}

struct StudioLut: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let sourceType: String
    let status: String
    let createdAt: String
    let completedAt: String?
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
