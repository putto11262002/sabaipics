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

    @EnvironmentObject private var coordinator: AppCoordinator
    @EnvironmentObject private var uploadStatusStore: UploadStatusStore
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    @State private var uploadByEventId: [String: UploadManager.EventSummary] = [:]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                UploadStatusHeaderView(
                    isOnline: connectivityStore.isOnline,
                    interface: connectivityStore.state.interface,
                    pendingCount: uploadStatusStore.summary.inFlight
                )
                .padding(.horizontal, 16)
                .padding(.top, 8)

                UploadStatsCardsRow(
                    pendingJobs: uploadStatusStore.summary.inFlight,
                    activeEvents: activeEventsCount,
                    syncedEvents: syncedEventsCount,
                    totalEvents: viewModel.events.count
                )
                .padding(.horizontal, 16)

                Group {
                    if viewModel.events.isEmpty && !connectivityStore.isOnline {
                        offlineEmptyStateView
                    } else if viewModel.isFirstLoad && viewModel.events.isEmpty {
                        skeletonListView
                    } else if let error = viewModel.error, viewModel.events.isEmpty {
                        errorView(error: error)
                    } else if viewModel.events.isEmpty {
                        emptyStateView
                    } else {
                        eventsList
                    }
                }
            }
            .navigationTitle("Events")
            .navigationBarTitleDisplayMode(.inline)
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
            await MainActor.run {
                self.uploadByEventId = summaries
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
    }

    private var activeEventsCount: Int {
        uploadByEventId.values.reduce(into: 0) { acc, s in
            if s.pending > 0 { acc += 1 }
        }
    }

    private var syncedEventsCount: Int {
        uploadByEventId.values.reduce(into: 0) { acc, s in
            if s.pending == 0 && s.completed > 0 { acc += 1 }
        }
    }

    // MARK: - Skeleton View

    private var skeletonListView: some View {
        List {
            Section {
                ForEach(Event.placeholders) { event in
                    SkeletonEventRow(title: event.name)
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .sabaiList()
        .redacted(reason: .placeholder)
        .disabled(true)
    }

    // MARK: - Event List

    private var eventsList: some View {
        List {
            Section {
                ForEach(viewModel.events) { event in
                    UploadEventStatusRow(
                        title: event.name,
                        isOnline: connectivityStore.isOnline,
                        summary: uploadByEventId[event.id]
                    )
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .sabaiList()
        .refreshable {
            await viewModel.refreshEvents()
        }
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

    private var offlineEmptyStateView: some View {
        OfflineEventsPlaceholderView()
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
            .buttonStyle(.compact)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

}

private struct UploadStatusHeaderView: View {
    let isOnline: Bool
    let interface: ConnectivityState.Interface?
    let pendingCount: Int

    var body: some View {
        let leftText = isOnline ? "Online" : "Offline"
        let rightText: String
        if isOnline {
            rightText = pendingCount > 0 ? "Syncing · \(pendingCount) left" : "Up to date"
        } else {
            rightText = pendingCount > 0 ? "Uploads paused · \(pendingCount) pending" : "Uploads paused"
        }

        let interfaceIcon = interfaceIconName(isOnline: isOnline, interface: interface)
        let interfaceTint: Color = isOnline ? Color.Theme.success : Color.Theme.warning

        let syncIcon = pendingCount > 0 ? "arrow.up.circle.fill" : "checkmark.circle.fill"
        let syncTint: Color = pendingCount > 0 ? Color.Theme.primary : Color.Theme.success

        return HStack(spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: interfaceIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(interfaceTint)
                Text(leftText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.Theme.foreground)
            }

            Divider()
                .frame(height: 16)

            HStack(spacing: 6) {
                Image(systemName: syncIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(syncTint)
                if isOnline && pendingCount > 0 {
                    ProgressView()
                        .controlSize(.mini)
                }
                Text(rightText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.Theme.foreground)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }

    private func interfaceIconName(isOnline: Bool, interface: ConnectivityState.Interface?) -> String {
        if !isOnline {
            return "wifi.slash"
        }
        switch interface {
        case .wifi:
            return "wifi"
        case .cellular:
            return "antenna.radiowaves.left.and.right"
        case .wiredEthernet:
            return "cable.connector"
        case .loopback:
            return "network"
        case .other:
            return "globe"
        case .none:
            return "network"
        }
    }
}

private struct UploadStatsCardsRow: View {
    let pendingJobs: Int
    let activeEvents: Int
    let syncedEvents: Int
    let totalEvents: Int

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        let columns: [GridItem] = {
            if horizontalSizeClass == .regular {
                return Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)
            }
            return Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)
        }()

        return LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
            UploadStatCard(
                icon: "tray.and.arrow.up",
                iconTint: Color.Theme.primary,
                title: "Pending",
                value: String(pendingJobs)
            )
            UploadStatCard(
                icon: "calendar.badge.clock",
                iconTint: Color.Theme.warning,
                title: "Active",
                value: String(activeEvents)
            )
            UploadStatCard(
                icon: "checkmark.seal.fill",
                iconTint: Color.Theme.success,
                title: "Synced",
                value: String(syncedEvents)
            )
            UploadStatCard(
                icon: "calendar",
                iconTint: Color.Theme.mutedForeground,
                title: "Events",
                value: String(totalEvents)
            )
        }
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
                .foregroundStyle(Color.Theme.mutedForeground)

            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(iconTint)
                Text(value)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.Theme.foreground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.Theme.border.opacity(0.6), lineWidth: 1)
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
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.Theme.foreground)
                .lineLimit(1)

            Spacer(minLength: 10)

            UploadEventSyncIndicator(isOnline: isOnline, summary: summary)
        }
        .padding(.vertical, 2)
        .sabaiCardRow()
    }
}

private struct UploadEventSyncIndicator: View {
    let isOnline: Bool
    let summary: UploadManager.EventSummary?

    var body: some View {
        let completed = summary?.completed ?? 0
        let pending = summary?.pending ?? 0

        if pending > 0 {
            let tint: Color = isOnline ? Color.Theme.primary : Color.Theme.warning
            HStack(spacing: 6) {
                if isOnline {
                    ProgressView()
                        .controlSize(.mini)
                }
                Text("\(pending) left")
                    .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(tint.opacity(0.10))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.25), lineWidth: 1))
            .foregroundStyle(tint)
            .accessibilityLabel("\(pending) left to sync")
        } else if completed > 0 {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.Theme.success)
                .accessibilityLabel("Synced")
        } else {
            Text("—")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.Theme.mutedForeground)
                .accessibilityLabel("No uploads")
        }
    }
}

private struct SkeletonEventRow: View {
    let title: String

    var body: some View {
        HStack {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.Theme.foreground)
                .lineLimit(1)

            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .sabaiCardRow()
    }
}

private struct OfflineEventsPlaceholderView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 52))
                .foregroundStyle(Color.Theme.mutedForeground)

            Text("Offline")
                .font(.headline)
                .foregroundStyle(Color.Theme.mutedForeground)

            Text("Events can’t be loaded right now. Uploads will resume when you’re back online.")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Previews

#Preview("Events Upload - Online Syncing") {
    VStack(spacing: 12) {
        UploadStatusHeaderView(
            isOnline: true,
            interface: .wifi,
            pendingCount: 7
        )
        UploadStatsCardsRow(
            pendingJobs: 7,
            activeEvents: 2,
            syncedEvents: 18,
            totalEvents: 10
        )
        List {
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
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .sabaiList()
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .background(Color.Theme.background)
}

#Preview("Events Upload - Offline Cold Start") {
    VStack(spacing: 12) {
        UploadStatusHeaderView(
            isOnline: false,
            interface: nil,
            pendingCount: 7
        )
        UploadStatsCardsRow(
            pendingJobs: 7,
            activeEvents: 0,
            syncedEvents: 0,
            totalEvents: 0
        )
        OfflineEventsPlaceholderView()
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .background(Color.Theme.background)
}

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
