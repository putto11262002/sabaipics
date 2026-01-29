//
//  EventsHomeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//  Updated: 2026-01-29 - SAB-39: Events browser with list and detail view
//

import SwiftUI

struct EventsHomeView: View {
    @State private var events: [Event] = []
    @State private var isLoading = false
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
                if isLoading && events.isEmpty {
                    loadingView
                } else if let error = error, events.isEmpty {
                    errorView(error: error)
                } else if events.isEmpty {
                    emptyStateView
                } else {
                    eventsList
                }
            }
            .navigationTitle("Events")
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

    // MARK: - Loading State

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Color.Theme.primary)
            Text("Loading events...")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        isLoading = true
        error = nil

        do {
            let response = try await apiClient.fetchEvents(page: 0, limit: 10)
            events = response.data
        } catch {
            self.error = error
        }

        isLoading = false
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
