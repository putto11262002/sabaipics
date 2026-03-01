//
//  EventsHomeView.swift
//  FrameFast
//
//  Created: 2026-01-22
//  Updated: 2026-01-29 - SAB-39: Events browser with skeleton loading
//  Updated: 2026-02-01 - Fix: Use @StateObject to persist state across tab switches
//

import SwiftUI

#if os(iOS)
import UIKit
#endif

// MARK: - ViewModel

@MainActor
class EventsViewModel: ObservableObject {
    @Published var events: [Event] = []
    @Published var isFirstLoad = true
    @Published var error: Error?
    @Published var isRefreshing = false
    @Published var eventsSource: SWRSource? = nil
    @Published var eventsFetchedAt: Date? = nil

    private let repository: EventsRepository

    init() {
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.repository = EventsRepository(baseURL: baseURL)
    }

    func loadEvents() async {
        isFirstLoad = events.isEmpty
        error = nil

        do {
            let result = try await repository.fetchEvents(
                page: 0,
                limit: 10,
                onRevalidate: { [weak self] result in
                    guard let self else { return }
                    self.events = result.value.data
                    self.eventsSource = result.source
                    self.eventsFetchedAt = result.fetchedAt
                },
                onAuthError: { [weak self] error in
                    guard let self else { return }
                    self.events = []
                    self.error = error
                }
            )

            // Only add minimum delay on genuine cold start (skeleton visible)
            if isFirstLoad && result.source == .network {
                try? await Task.sleep(nanoseconds: 300_000_000) // 300ms
            }

            events = result.value.data
            eventsSource = result.source
            eventsFetchedAt = result.fetchedAt
        } catch {
            if isFirstLoad {
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
            self.error = error
        }

        isFirstLoad = false
    }

    func refreshEvents() async {
        isRefreshing = true

        do {
            let result = try await repository.refreshEvents(page: 0, limit: 10)
            events = result.value.data
            eventsSource = result.source
            eventsFetchedAt = result.fetchedAt
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

    @EnvironmentObject private var coordinator: AppCoordinator
    @EnvironmentObject private var uploadStatusStore: UploadStatusStore
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    @State private var uploadByEventId: [String: UploadManager.EventSummary] = [:]
    @State private var uploadedLast7Days: Int = 0

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isFirstLoad && viewModel.events.isEmpty {
                    skeletonListView
                } else if let error = viewModel.error, viewModel.events.isEmpty {
                    if connectivityStore.state.isOffline {
                        offlineEmptyStateView
                    } else {
                        errorView(error: error)
                    }
                } else if viewModel.events.isEmpty {
                    emptyStateView
                } else {
                    eventsList
                }
            }
            .refreshable {
                await viewModel.refreshEvents()
            }
            #if os(iOS)
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            #endif
            .navigationTitle("Activity")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ConnectivityStatusToolbarView()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    CreditsToolbarView()
                }
            }
            .task {
                if viewModel.events.isEmpty {
                    await viewModel.loadEvents()
                }
            }
            .task {
                await uploadLoop()
            }
        }
    }

    private func uploadLoop() async {
        while !Task.isCancelled {
            let eventIds = await MainActor.run { viewModel.events.map(\.id) }
            let summaries = await coordinator.uploadManager.eventSummaries(eventIds: eventIds)
            let last7 = await coordinator.uploadManager.completedCountLast7Days()
            await MainActor.run {
                self.uploadByEventId = summaries
                self.uploadedLast7Days = last7
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
    }

    // MARK: - Skeleton View

    private var skeletonListView: some View {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 0,
                    uploadedLast7Days: 0
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
                .redacted(reason: .placeholder)
            }

            Section {
                ForEach(Event.placeholders) { event in
                    SkeletonEventRow(title: event.name)
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.secondary)
            }
        }
        .redacted(reason: .placeholder)
        .disabled(true)
    }

    // MARK: - Event List

    private var eventsList: some View {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: uploadStatusStore.summary.inFlight,
                    uploadedLast7Days: uploadedLast7Days
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                ForEach(viewModel.events) { event in
                    NavigationLink(value: event) {
                        UploadEventStatusRow(
                            title: event.name,
                            isOnline: connectivityStore.isOnline,
                            summary: uploadByEventId[event.id]
                        )
                    }
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.secondary)
            }
        }
        .navigationDestination(for: Event.self) { event in
            EventDetailView(eventId: event.id)
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: uploadStatusStore.summary.inFlight,
                    uploadedLast7Days: uploadedLast7Days
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                VStack(spacing: 16) {
                    Image(systemName: "calendar")
                        .font(.system(size: 60))
                        .foregroundStyle(Color.secondary)

                    Text("No events yet")
                        .font(.headline)
                        .foregroundStyle(Color.primary)

                    Text("Your events will appear here once created")
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
        }
    }

    private var offlineEmptyStateView: some View {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: uploadStatusStore.summary.inFlight,
                    uploadedLast7Days: uploadedLast7Days
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                OfflineEventsPlaceholderView()
                    .listRowBackground(Color.clear)
            }
        }
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorView(error: Error) -> some View {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: uploadStatusStore.summary.inFlight,
                    uploadedLast7Days: uploadedLast7Days
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.red)

                    Text("Error Loading Events")
                        .font(.headline)
                        .foregroundStyle(Color.primary)

                    Text(error.localizedDescription)
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    Button {
                        Task {
                            await viewModel.loadEvents()
                        }
                    } label: {
                        Text("Retry")
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
        }
    }

}

private struct UploadStatsCardsRow: View {
    let pendingJobs: Int
    let uploadedLast7Days: Int

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        let columns: [GridItem] = {
            if horizontalSizeClass == .regular {
                return Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)
            }
            return Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)
        }()

        return LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
            UploadSyncCard(pendingJobs: pendingJobs)
            UploadStatCard(
                icon: "tray.and.arrow.up",
                iconTint: Color.green,
                title: "Uploaded (7d)",
                value: String(uploadedLast7Days)
            )
        }
    }
}

private struct UploadSyncCard: View {
    let pendingJobs: Int

    var body: some View {
        let icon = "clock.arrow.circlepath"
        let tint: Color = Color.orange
        let value = pendingJobs == 0 ? "—" : "\(pendingJobs)"

        return UploadStatCard(
            icon: icon,
            iconTint: tint,
            title: "Upload queue",
            value: value
        )
    }
}

private struct UploadStatCard: View {
    let icon: String
    let iconTint: Color
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(Color.secondary)

            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(iconTint)
                Spacer(minLength: 8)
                Text(value)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.primary)
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(UIColor.separator).opacity(0.6), lineWidth: 1)
        )
    }
}

private struct UploadEventStatusRow: View {
    let title: String
    let isOnline: Bool
    let summary: UploadManager.EventSummary?

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.body)
                .foregroundStyle(Color.primary)

            Spacer(minLength: 10)

            UploadEventSyncIndicator(isOnline: isOnline, summary: summary)
        }
            }
}

private struct UploadEventSyncIndicator: View {
    let isOnline: Bool
    let summary: UploadManager.EventSummary?

    var body: some View {
        let completed = summary?.completed ?? 0
        let pending = summary?.pending ?? 0

        if pending > 0 {
            let tint: Color = isOnline ? Color.accentColor : Color.orange
            if isOnline {
                ProgressView()
                    .controlSize(.mini)
                    .tint(tint)
                    .accessibilityLabel("Syncing")
            } else {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.secondary)
                    .accessibilityLabel("Pending")
            }
        } else if completed > 0 {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.green)
                .accessibilityLabel("Synced")
        } else {
            Text("—")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.secondary)
                .accessibilityLabel("No uploads")
        }
    }
}

struct SkeletonEventRow: View {
    let title: String

    var body: some View {
        HStack {
            Text(title)
                .font(.body)
                .foregroundStyle(Color.primary)

            Spacer(minLength: 0)
        }
            }
}

struct OfflineEventsPlaceholderView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 52))
                .foregroundStyle(Color.secondary)

            Text("Offline")
                .font(.headline)
                .foregroundStyle(Color.secondary)

            Text("Events can't be loaded right now. Uploads will resume when you're back online.")
                .font(.subheadline)
                .foregroundStyle(Color.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Previews

#Preview("1. Skeleton") {
    NavigationStack {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 0,
                    uploadedLast7Days: 0
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
                .redacted(reason: .placeholder)
            }

            Section {
                ForEach(Event.placeholders) { event in
                    SkeletonEventRow(title: event.name)
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.secondary)
            }
        }
        .redacted(reason: .placeholder)
        .disabled(true)
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
    }
}

#Preview("2. Loaded Events") {
    NavigationStack {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 3,
                    uploadedLast7Days: 42
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                UploadEventStatusRow(
                    title: "Bangkok Wedding",
                    isOnline: true,
                    summary: .init(eventId: "evt_1", completed: 3, pending: 9)
                )
                UploadEventStatusRow(
                    title: "Chiang Mai Portraits",
                    isOnline: true,
                    summary: .init(eventId: "evt_2", completed: 12, pending: 0)
                )
                UploadEventStatusRow(
                    title: "No Uploads Yet",
                    isOnline: true,
                    summary: nil
                )
            } header: {
                Text("Events")
                    .foregroundStyle(Color.secondary)
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
    }
}

#Preview("3. Empty State") {
    NavigationStack {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 0,
                    uploadedLast7Days: 0
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                VStack(spacing: 16) {
                    Image(systemName: "calendar")
                        .font(.system(size: 60))
                        .foregroundStyle(Color.secondary)

                    Text("No events yet")
                        .font(.headline)
                        .foregroundStyle(Color.primary)

                    Text("Your events will appear here once created")
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
    }
}

#Preview("4. Offline") {
    NavigationStack {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 5,
                    uploadedLast7Days: 0
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                OfflineEventsPlaceholderView()
                    .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
    }
}

#Preview("5. Error") {
    NavigationStack {
        List {
            Section {
                UploadStatsCardsRow(
                    pendingJobs: 0,
                    uploadedLast7Days: 12
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.red)

                    Text("Error Loading Events")
                        .font(.headline)
                        .foregroundStyle(Color.primary)

                    Text("The server returned an unexpected response.")
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    Button("Retry") {}
                        .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
    }
}
