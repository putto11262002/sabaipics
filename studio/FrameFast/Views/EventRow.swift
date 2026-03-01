//
//  EventRow.swift
//  FrameFast
//
//  Created: 2026-01-29
//

import SwiftUI

struct EventRow: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(event.name)
                .font(.headline)
                .foregroundStyle(Color.primary)

            Text(event.createdAt.relativeTime())
                .font(.caption)
                .foregroundStyle(Color.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("Event Row") {
    List {
        EventRow(event: Event(
            id: "evt_123",
            name: "Wedding - Bangkok Grand Hotel",
            subtitle: "John & Jane's Special Day",
            logoUrl: nil,
            startDate: "2026-02-14T18:00:00.000+07:00",
            endDate: "2026-02-14T23:00:00.000+07:00",
            createdAt: "2026-01-27T10:30:00.000+07:00",
            expiresAt: "2026-03-14T23:59:59.000+07:00"
        ))

        EventRow(event: Event(
            id: "evt_124",
            name: "Corporate Event 2026",
            subtitle: nil,
            logoUrl: nil,
            startDate: "2026-03-01T09:00:00.000+07:00",
            endDate: "2026-03-01T17:00:00.000+07:00",
            createdAt: "2026-01-20T14:15:00.000+07:00",
            expiresAt: "2026-04-01T23:59:59.000+07:00"
        ))
    }
    .listStyle(.insetGrouped)
    .scrollContentBackground(.hidden)
    .background(Color(UIColor.systemBackground))
}
