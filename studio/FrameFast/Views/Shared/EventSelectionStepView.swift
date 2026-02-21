//  EventSelectionStepView.swift
//  FrameFast
//
//  Event selection step inside the camera connect flow.
//  Large title, event list, circle chevron to continue.

import SwiftUI

struct EventSelectionStepView: View {
    let preselectedEventId: String?
    let onContinue: (_ eventId: String, _ eventName: String) -> Void

    @StateObject private var viewModel = EventsViewModel()
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    @State private var selectedEventId: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if viewModel.isFirstLoad && viewModel.events.isEmpty {
                    skeletonList
                } else if let error = viewModel.error, viewModel.events.isEmpty {
                    if connectivityStore.state.isOffline {
                        offlineView
                    } else {
                        errorView(error: error)
                    }
                } else if viewModel.events.isEmpty {
                    emptyView
                } else {
                    eventsList
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            HStack {
                Spacer()
                CircleNavButton(disabled: selectedEventId == nil) {
                    guard let event = selectedEvent else { return }
                    onContinue(event.id, event.name)
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
            .padding(.top, 12)
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

    private var selectedEvent: Event? {
        guard let selectedEventId else { return nil }
        return viewModel.events.first { $0.id == selectedEventId }
    }

    // MARK: - Events List

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
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .sabaiCardRow()
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

    // MARK: - Skeleton

    private var skeletonList: some View {
        List {
            Section {
                ForEach(Event.placeholders) { event in
                    HStack {
                        Text(event.name)
                            .font(.body)
                            .foregroundStyle(Color.Theme.foreground)
                        Spacer(minLength: 0)
                    }
                    .sabaiCardRow()
                }
            } header: {
                Text("Events")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .redacted(reason: .placeholder)
        .disabled(true)
    }

    // MARK: - Empty

    private var emptyView: some View {
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
    }

    // MARK: - Offline

    private var offlineView: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 52))
                .foregroundStyle(Color.Theme.mutedForeground)

            Text("Offline")
                .font(.headline)
                .foregroundStyle(Color.Theme.mutedForeground)

            Text("Events can't be loaded right now. Uploads will resume when you're back online.")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
    }

    // MARK: - Error

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
                Task { await viewModel.loadEvents() }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.primary)
        }
        .padding()
    }
}

#if DEBUG

#Preview("Event Selection — Dark") {
    NavigationStack {
        EventSelectionStepView(
            preselectedEventId: nil,
            onContinue: { _, _ in }
        )
        .navigationTitle("Select Event")
        .navigationBarTitleDisplayMode(.large)
    }
    .preferredColorScheme(.dark)
}

#Preview("Event Selection — Light") {
    NavigationStack {
        EventSelectionStepView(
            preselectedEventId: nil,
            onContinue: { _, _ in }
        )
        .navigationTitle("Select Event")
        .navigationBarTitleDisplayMode(.large)
    }
    .preferredColorScheme(.light)
}

#endif
