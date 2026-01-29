//
//  EventDetailView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-29
//  Redesigned: Clean iOS-native detail view
//

import SwiftUI
import UIKit

struct EventDetailView: View {
    let eventId: String

    @State private var event: Event?
    @State private var isLoading = false
    @State private var error: Error?
    @State private var showCopyConfirmation = false

    private let apiClient: EventsAPIClient

    init(eventId: String) {
        self.eventId = eventId

        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.apiClient = EventsAPIClient(baseURL: baseURL)
    }

    var body: some View {
        Group {
            if isLoading {
                loadingView
            } else if let error = error {
                errorView(error: error)
            } else if let event = event {
                eventContent(event: event)
            } else {
                Text("No event data")
                    .foregroundStyle(Color.Theme.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Color.Theme.primary)
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

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Color.Theme.primary)
            Text("Loading event...")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Event Content

    @ViewBuilder
    private func eventContent(event: Event) -> some View {
        Form {
            Section("Details") {
                LabeledContent("Name", value: event.name)

                if let subtitle = event.subtitle {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Subtitle")
                            .font(.caption)
                            .foregroundStyle(Color.Theme.mutedForeground)
                        Text(subtitle)
                            .font(.body)
                            .foregroundStyle(Color.Theme.foreground)
                    }
                    .padding(.vertical, 4)
                }

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
                        .foregroundStyle(Color.Theme.primary)
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
                .foregroundStyle(Color.Theme.destructive)

            Text("Error Loading Event")
                .font(.headline)
                .foregroundStyle(Color.Theme.foreground)

            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                Task {
                    await loadEvent()
                }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.primary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helper Methods

    private func loadEvent() async {
        isLoading = true
        error = nil

        do {
            let response = try await apiClient.fetchEvent(id: eventId)
            event = response.data
        } catch {
            print("[EventDetail Error] Failed to load event \(eventId): \(error.localizedDescription)")
            self.error = error
        }

        isLoading = false
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
                .foregroundStyle(Color.Theme.primary)
            Text("Copied to clipboard")
                .font(.subheadline)
                .foregroundStyle(Color.Theme.foreground)
        }
        .padding()
        .background(Color.Theme.card)
        .cornerRadius(10)
        .shadow(color: Color.Theme.foreground.opacity(0.1), radius: 8, x: 0, y: 2)
        .padding(.top, 8)
    }
}

// MARK: - Preview

#Preview("Event Detail") {
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

#Preview("Event Detail - Long Text") {
    NavigationStack {
        EventDetailPreview(
            event: Event(
                id: "evt_preview_2",
                name: "Corporate Annual Meeting 2026",
                subtitle: "This is a very long subtitle that will wrap to multiple lines to test layout",
                logoUrl: nil,
                startDate: "2026-03-01T09:00:00.000+07:00",
                endDate: "2026-03-01T17:00:00.000+07:00",
                createdAt: "2026-01-20T14:15:00.000+07:00",
                expiresAt: "2026-04-01T23:59:59.000+07:00"
            )
        )
    }
}

// Preview wrapper
private struct EventDetailPreview: View {
    let event: Event

    var body: some View {
        Form {
            Section("Details") {
                LabeledContent("Name", value: event.name)

                if let subtitle = event.subtitle {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Subtitle")
                            .font(.caption)
                            .foregroundStyle(Color.Theme.mutedForeground)
                        Text(subtitle)
                            .font(.body)
                            .foregroundStyle(Color.Theme.foreground)
                    }
                    .padding(.vertical, 4)
                }

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
                        .foregroundStyle(Color.Theme.primary)
                }
            }
        }
    }
}
