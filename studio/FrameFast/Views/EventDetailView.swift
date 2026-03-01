//
//  EventDetailView.swift
//  FrameFast
//
//  Created: 2026-01-29
//  Redesigned: Clean iOS-native detail view
//

import SwiftUI
import UIKit

struct EventDetailView: View {
    let eventId: String

    @State private var event: Event?
    @State private var isFirstLoad = true
    @State private var isRefreshing = false
    @State private var error: Error?
    @State private var showCopyConfirmation = false

    private let repository: EventsRepository

    init(eventId: String) {
        self.eventId = eventId

        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.repository = EventsRepository(baseURL: baseURL)
    }

    var body: some View {
        contentView
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Color.accentColor)
            .task {
                await loadEvent()
            }
            .overlay(alignment: .top) {
                if showCopyConfirmation {
                    CopyConfirmationView()
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
    }

    @ViewBuilder
    private var contentView: some View {
        if isFirstLoad && event == nil {
            skeletonView
        } else if let error = error {
            errorView(error: error)
        } else if let event = event {
            eventContentView(event: event)
        } else {
            Text("No event data")
                .foregroundStyle(Color.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Skeleton View

    private var skeletonView: some View {
        eventContentView(event: .placeholder)
            .redacted(reason: .placeholder)
            .disabled(true)
    }

    // MARK: - Event Content

    @ViewBuilder
    private func eventContentView(event: Event) -> some View {
        List {
            Section("Details") {
                LabeledContent("Name", value: event.name)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Subtitle")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                    Text(event.subtitle ?? "No subtitle")
                        .font(.body)
                        .foregroundStyle(event.subtitle != nil ? Color.primary : Color.secondary)
                }
                .padding(.vertical, 4)

                if let startDate = event.startDate {
                    LabeledContent("Start Date", value: startDate.formattedDateTime())
                }

                if let endDate = event.endDate {
                    LabeledContent("End Date", value: endDate.formattedDateTime())
                }

                LabeledContent("Created", value: event.createdAt.formattedDateTime())
                LabeledContent("Expires", value: event.expiresAt.formattedDateTime())
            }
        }
        .listStyle(.insetGrouped)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        copyToClipboard(searchURL(for: event))
                    } label: {
                        Label("Copy Search Link", systemImage: "magnifyingglass")
                    }

                    Button {
                        copyToClipboard(slideshowURL(for: event))
                    } label: {
                        Label("Copy Slideshow Link", systemImage: "play.rectangle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }

    // MARK: - Error View

    @ViewBuilder
    private func errorView(error: Error) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(Color.red)

            Text("Error Loading Event")
                .font(.headline)
                .foregroundStyle(Color.primary)

            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundStyle(Color.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                Task {
                    await loadEvent()
                }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helper Methods

    private func loadEvent(isRefresh: Bool = false) async {
        if !isRefresh {
            isFirstLoad = event == nil
        }

        if isRefresh {
            isRefreshing = true
        }

        error = nil

        // Concurrent operations: fetch + minimum display time
        async let eventData = repository.fetchEvent(id: eventId)
        async let minimumDelay: () = Task.sleep(nanoseconds: 300_000_000)  // 300ms

        do {
            let result = try await eventData
            try await minimumDelay  // Prevent skeleton flicker on fast loads
            event = result.value.data
        } catch {
            try? await minimumDelay
            print("[EventDetail Error] Failed to load event \(eventId): \(error.localizedDescription)")
            self.error = error
        }

        isFirstLoad = false
        isRefreshing = false
    }

    private func searchURL(for event: Event) -> String {
        let frontendURL = Bundle.main.object(forInfoDictionaryKey: "EventFrontendURL") as? String ?? "https://sabaipics.com"
        return "\(frontendURL)/participant/events/\(event.id)/search"
    }

    private func slideshowURL(for event: Event) -> String {
        let frontendURL = Bundle.main.object(forInfoDictionaryKey: "EventFrontendURL") as? String ?? "https://sabaipics.com"
        return "\(frontendURL)/participant/events/\(event.id)/slideshow"
    }

    private func copyToClipboard(_ text: String) {
        UIPasteboard.general.string = text

        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showCopyConfirmation = true
        }

        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showCopyConfirmation = false
            }
        }
    }
}

// MARK: - Supporting Views

struct CopyConfirmationView: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.accentColor)
            Text("Copied to clipboard")
                .font(.subheadline)
                .foregroundStyle(Color.primary)
        }
        .padding()
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(10)
        .shadow(color: Color.primary.opacity(0.1), radius: 8, x: 0, y: 2)
        .padding(.top, 8)
    }
}

// MARK: - Previews

#Preview("1. Skeleton Loading") {
    NavigationStack {
        EventDetailSkeletonPreview()
    }
}

#Preview("2. Loaded Event") {
    NavigationStack {
        EventDetailPreview(
            event: Event(
                id: "evt_preview",
                name: "Wedding - Bangkok Grand Hotel",
                subtitle: "John & Jane's Special Day",
                logoUrl: nil,
                startDate: "2026-02-14T18:00:00.000+07:00",
                endDate: "2026-02-14T23:00:00.000+07:00",
                createdAt: "2026-01-27T10:30:00.000+07:00",
                expiresAt: "2026-03-14T23:59:59.000+07:00"
            )
        )
    }
}

#Preview("3. Long Subtitle (Wrapping)") {
    NavigationStack {
        EventDetailPreview(
            event: Event(
                id: "evt_preview_2",
                name: "Corporate Annual Meeting 2026",
                subtitle: "This is a very long subtitle that will wrap to multiple lines to test layout and ensure proper text wrapping behavior in the detail view",
                logoUrl: nil,
                startDate: "2026-03-01T09:00:00.000+07:00",
                endDate: "2026-03-01T17:00:00.000+07:00",
                createdAt: "2026-01-20T14:15:00.000+07:00",
                expiresAt: "2026-04-01T23:59:59.000+07:00"
            )
        )
    }
}

#Preview("4. Minimal Event (No Optional Fields)") {
    NavigationStack {
        EventDetailPreview(
            event: Event(
                id: "evt_minimal",
                name: "Minimal Event",
                subtitle: nil,
                logoUrl: nil,
                startDate: nil,
                endDate: nil,
                createdAt: "2026-01-20T14:15:00.000+07:00",
                expiresAt: "2026-04-01T23:59:59.000+07:00"
            )
        )
    }
}

#Preview("5. Error State") {
    NavigationStack {
        EventDetailErrorPreview()
    }
}

// MARK: - Preview Helpers

private struct EventDetailSkeletonPreview: View {
    var body: some View {
        List {
            Section("Details") {
                LabeledContent("Name", value: "Loading Event Name")

                VStack(alignment: .leading, spacing: 4) {
                    Text("Subtitle")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                    Text("Loading subtitle text here")
                        .font(.body)
                        .foregroundStyle(Color.primary)
                }
                .padding(.vertical, 4)

                LabeledContent("Start Date", value: "Jan 1, 2026 at 12:00 AM")
                LabeledContent("End Date", value: "Jan 1, 2026 at 12:00 AM")
                LabeledContent("Created", value: "Jan 1, 2026 at 12:00 AM")
                LabeledContent("Expires", value: "Jan 1, 2026 at 12:00 AM")
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .disabled(true)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EventDetailPreview: View {
    let event: Event

    var body: some View {
        List {
            Section("Details") {
                LabeledContent("Name", value: event.name)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Subtitle")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                    Text(event.subtitle ?? "No subtitle")
                        .font(.body)
                        .foregroundStyle(event.subtitle != nil ? Color.primary : Color.secondary)
                }
                .padding(.vertical, 4)

                if let startDate = event.startDate {
                    LabeledContent("Start Date", value: startDate.formattedDateTime())
                }

                if let endDate = event.endDate {
                    LabeledContent("End Date", value: endDate.formattedDateTime())
                }

                LabeledContent("Created", value: event.createdAt.formattedDateTime())
                LabeledContent("Expires", value: event.expiresAt.formattedDateTime())
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {} label: {
                        Label("Copy Search Link", systemImage: "magnifyingglass")
                    }
                    Button {} label: {
                        Label("Copy Slideshow Link", systemImage: "play.rectangle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}

private struct EventDetailErrorPreview: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(Color.red)

            Text("Error Loading Event")
                .font(.headline)
                .foregroundStyle(Color.primary)

            Text("The network connection was lost.")
                .font(.subheadline)
                .foregroundStyle(Color.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                // Preview only
            } label: {
                Text("Retry")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}
