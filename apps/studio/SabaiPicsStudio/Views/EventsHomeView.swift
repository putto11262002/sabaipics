//
//  EventsHomeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//  Updated: 2026-01-29 - SAB-39: Events browser with skeleton loading
//  Updated: 2026-02-01 - Fix: Use @StateObject to persist state across tab switches
//

import SwiftUI

// MARK: - ViewModel

@MainActor
class EventsViewModel: ObservableObject {
    @Published var events: [Event] = []
    @Published var isFirstLoad = true
    @Published var error: Error?
    @Published var isRefreshing = false

    private let apiClient: EventsAPIClient

    init() {
        // Get API base URL from Info.plist or use default
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.apiClient = EventsAPIClient(baseURL: baseURL)
    }

    func loadEvents() async {
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

    func refreshEvents() async {
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

// MARK: - View

struct EventsHomeView: View {
    @StateObject private var viewModel = EventsViewModel()
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if viewModel.isFirstLoad && viewModel.events.isEmpty {
                    skeletonListView
                } else if let error = viewModel.error, viewModel.events.isEmpty {
                    errorView(error: error)
                } else if viewModel.events.isEmpty {
                    emptyStateView
                } else {
                    eventsList
                }
            }
            .navigationTitle("Events")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { eventId in
                EventDetailView(eventId: eventId)
            }
            .refreshable {
                await viewModel.refreshEvents()
            }
            .task {
                if viewModel.events.isEmpty {
                    await viewModel.loadEvents()
                }
            }
            .onAppear {
                // Reset navigation state when view appears (fixes fullScreenCover corruption)
                navigationPath = NavigationPath()
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
                ForEach(viewModel.events) { event in
                    NavigationLink(value: event.id) {
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
                    await viewModel.loadEvents()
                }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.primary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
