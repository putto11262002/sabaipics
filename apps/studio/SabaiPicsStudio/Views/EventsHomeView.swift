//
//  EventsHomeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//  Updated: 2026-01-29 - SAB-39: Events browser with skeleton loading
//

import SwiftUI

struct EventsHomeView: View {
    @State private var events: [Event] = []
    @State private var isFirstLoad = true
    @State private var error: Error?
    @State private var isRefreshing = false

    private let apiClient: EventsAPIClient

    init() {
        // Get API base URL from Info.plist or use default
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.apiClient = EventsAPIClient(baseURL: baseURL)
    }

    var body: some View {
        NavigationStack {
            Group {
                if isFirstLoad && events.isEmpty {
                    skeletonListView
                } else if let error = error, events.isEmpty {
                    errorView(error: error)
                } else if events.isEmpty {
                    emptyStateView
                } else {
                    eventsList
                }
            }
            .navigationTitle("Events")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await refreshEvents()
            }
            .task {
                if events.isEmpty {
                    await loadEvents()
                }
            }
        }
    }

    // MARK: - Skeleton View

    private var skeletonListView: some View {
        List {
            Section {
                ForEach(Event.placeholders) { event in
                    EventRow(event: event)
                }
            } header: {
                Text("Recent Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .disabled(true)
    }

    // MARK: - Event List

    private var eventsList: some View {
        List {
            Section {
                ForEach(events) { event in
                    NavigationLink(destination: EventDetailView(eventId: event.id)) {
                        EventRow(event: event)
                    }
                }
            } header: {
                Text("Recent Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "calendar")
                .font(.system(size: 60))
                .foregroundStyle(Color.Theme.mutedForeground)

            Text("No events yet")
                .font(.headline)
                .foregroundStyle(Color.Theme.foreground)

            Text("Your events will appear here once created")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorView(error: Error) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(Color.Theme.destructive)

            Text("Error Loading Events")
                .font(.headline)
                .foregroundStyle(Color.Theme.foreground)

            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                Task {
                    await loadEvents()
                }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.primary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Data Loading

    private func loadEvents() async {
        isFirstLoad = events.isEmpty
        error = nil

        // Concurrent operations: fetch + minimum display time
        async let eventsData = apiClient.fetchEvents(page: 0, limit: 10)
        async let minimumDelay: () = Task.sleep(nanoseconds: 300_000_000)  // 300ms

        do {
            let response = try await eventsData
            try await minimumDelay  // Prevent skeleton flicker
            events = response.data
        } catch {
            try? await minimumDelay
            self.error = error
        }

        isFirstLoad = false
    }

    private func refreshEvents() async {
        isRefreshing = true

        do {
            let response = try await apiClient.fetchEvents(page: 0, limit: 10)
            events = response.data
            error = nil
        } catch {
            self.error = error
        }

        isRefreshing = false
    }
}

// MARK: - Previews

#Preview("1. Skeleton Loading") {
    NavigationStack {
        EventsHomeSkeletonPreview()
    }
}

#Preview("2. Loaded Events") {
    NavigationStack {
        EventsHomeView()
    }
}

// MARK: - Preview Helpers

private struct EventsHomeSkeletonPreview: View {
    var body: some View {
        List {
            Section {
                ForEach(Event.placeholders) { event in
                    EventRow(event: event)
                }
            } header: {
                Text("Recent Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .disabled(true)
        .navigationTitle("Events")
    }
}
