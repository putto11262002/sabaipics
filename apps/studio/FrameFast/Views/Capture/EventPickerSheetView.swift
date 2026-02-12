//  EventPickerSheetView.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import SwiftUI

struct EventPickerSheetView: View {
    @StateObject private var viewModel = EventsViewModel()
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    let preselectedEventId: String?
    let onCancel: () -> Void
    let onConfirm: (_ eventId: String, _ eventName: String) -> Void

    @State private var selectedEventId: String? = nil

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
            .navigationTitle("Select Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Continue") {
                        guard let selectedEvent else { return }
                        onConfirm(selectedEvent.id, selectedEvent.name)
                    }
                    .disabled(selectedEventId == nil)
                }
            }
            .task {
                if selectedEventId == nil {
                    selectedEventId = preselectedEventId
                }
                if viewModel.events.isEmpty {
                    await viewModel.loadEvents()
                }
            }
        }
    }

    private var selectedEvent: Event? {
        guard let selectedEventId else { return nil }
        return viewModel.events.first { $0.id == selectedEventId }
    }

    private var eventsList: some View {
        List {
            Section {
                ForEach(viewModel.events) { event in
                    Button {
                        selectedEventId = event.id
                    } label: {
                        HStack(spacing: 12) {
                            Text(event.name)
                                .font(.body)
                                .foregroundStyle(Color.Theme.foreground)
                            Spacer(minLength: 8)
                            if selectedEventId == event.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Color.Theme.primary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .refreshable {
            await viewModel.refreshEvents()
        }
    }

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
        .redacted(reason: .placeholder)
        .disabled(true)
    }

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

private struct SkeletonEventRow: View {
    let title: String

    var body: some View {
        HStack {
            Text(title)
                .font(.body)
                .foregroundStyle(Color.Theme.foreground)

            Spacer(minLength: 0)
        }
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
