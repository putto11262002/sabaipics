//  EventPickerSheetView.swift
//  SabaiPicsStudio
//
//  Created: 2026-02-08
//

import SwiftUI

struct EventPickerSheetView: View {
    @StateObject private var viewModel = EventsViewModel()

    let preselectedEventId: String?
    let onCancel: () -> Void
    let onConfirm: (_ eventId: String, _ eventName: String) -> Void

    @State private var selectedEventId: String? = nil

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isFirstLoad && viewModel.events.isEmpty {
                    skeletonList
                } else if let error = viewModel.error, viewModel.events.isEmpty {
                    errorView(error)
                } else {
                    list
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

    private var list: some View {
        List {
            Section {
                ForEach(viewModel.events) { event in
                    Button {
                        selectedEventId = event.id
                    } label: {
                        HStack(spacing: 12) {
                            EventRow(event: event)
                            Spacer(minLength: 8)
                            if selectedEventId == event.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Color.Theme.primary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 2)
                }
            } header: {
                Text("Choose where uploads go")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
    }

    private var skeletonList: some View {
        List {
            Section {
                ForEach(Event.placeholders) { event in
                    EventRow(event: event)
                }
            } header: {
                Text("Choose where uploads go")
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .disabled(true)
    }

    @ViewBuilder
    private func errorView(_ error: Error) -> some View {
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
