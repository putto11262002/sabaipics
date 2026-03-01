//
//  EventDetailView.swift
//  FrameFast
//
//  Created: 2026-01-29
//  Redesigned: Full detail view with FTP, pipeline, links, upload stats
//

import SwiftUI
import UIKit

struct EventDetailView: View {
    let eventId: String

    @EnvironmentObject private var coordinator: AppCoordinator

    @State private var event: Event?
    @State private var isFirstLoad = true
    @State private var error: Error?
    @State private var copiedItem: CopyableItem?

    // FTP (bare response — no data wrapper)
    @State private var ftpCredentials: FtpCredentials?
    @State private var ftpNotConfigured = false
    @State private var ftpPassword: String?
    @State private var isRevealingPassword = false

    // Image Pipeline (summary only — editing happens in ImagePipelineView)
    @State private var pipelineSettings: ImagePipelineSettings?

    // Edit sheet
    @State private var editField: EditableField?
    @State private var editValue: String = ""
    @State private var isSavingEdit = false

    // Upload stats
    @State private var uploadSummary: UploadManager.EventSummary?

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
                await loadAllData()
            }
            .task {
                await uploadLoop()
            }
            .sheet(item: $editField) { field in
                EditFieldSheet(
                    field: field,
                    value: $editValue,
                    isSaving: $isSavingEdit,
                    onSave: { newValue in
                        await saveField(field, value: newValue)
                    }
                )
            }
    }

    @ViewBuilder
    private var contentView: some View {
        if isFirstLoad && event == nil {
            skeletonView
        } else if let error = error, event == nil {
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
            Section("Upload Activity") {
                uploadActivitySection
            }

            Section("Details") {
                detailsSection(event: event)
            }

            Section("Links") {
                linksSection(event: event)
            }

            Section("FTP") {
                ftpSection
            }

            Section {
                imagePipelineSection
            }

            Section("Info") {
                infoSection(event: event)
            }
        }
        .listStyle(.insetGrouped)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Copy Search Link") {
                        copyToClipboard(searchURL(for: event), item: .searchLink)
                    }
                    Button("Copy Slideshow Link") {
                        copyToClipboard(slideshowURL(for: event), item: .slideshowLink)
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    // MARK: - Upload Activity Section

    private var uploadActivitySection: some View {
        HStack(spacing: 12) {
            EventDetailStatCard(
                icon: "clock.arrow.circlepath",
                iconTint: Color.orange,
                title: "Pending",
                value: "\(uploadSummary?.pending ?? 0)"
            )
            EventDetailStatCard(
                icon: "checkmark.circle",
                iconTint: Color.green,
                title: "Completed",
                value: "\(uploadSummary?.completed ?? 0)"
            )
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
        .listRowBackground(Color.clear)
    }

    // MARK: - Details Section

    @ViewBuilder
    private func detailsSection(event: Event) -> some View {
        Button {
            editField = .name
            editValue = event.name
        } label: {
            LabeledContent("Name") {
                Text(event.name)
                    .foregroundStyle(Color.primary)
            }
        }
        .foregroundStyle(Color.primary)

        Button {
            editField = .subtitle
            editValue = event.subtitle ?? ""
        } label: {
            LabeledContent("Subtitle") {
                Text(event.subtitle ?? "No subtitle")
                    .foregroundStyle(event.subtitle != nil ? Color.primary : Color.secondary)
            }
        }
        .foregroundStyle(Color.primary)
    }

    // MARK: - Links Section

    @ViewBuilder
    private func linksSection(event: Event) -> some View {
        HStack {
            Label("Search Link", systemImage: "magnifyingglass")
                .font(.body)
            Spacer()
            Button {
                copyToClipboard(searchURL(for: event), item: .searchLink)
            } label: {
                Image(systemName: copiedItem == .searchLink ? "checkmark" : "doc.on.doc")
                    .font(.subheadline)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(copiedItem == .searchLink ? Color.green : Color.accentColor)
        }

        HStack {
            Label("Slideshow Link", systemImage: "play.rectangle")
                .font(.body)
            Spacer()
            Button {
                copyToClipboard(slideshowURL(for: event), item: .slideshowLink)
            } label: {
                Image(systemName: copiedItem == .slideshowLink ? "checkmark" : "doc.on.doc")
                    .font(.subheadline)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(copiedItem == .slideshowLink ? Color.green : Color.accentColor)
        }
    }

    // MARK: - FTP Section

    @ViewBuilder
    private var ftpSection: some View {
        if ftpNotConfigured {
            Text("Not configured")
                .foregroundStyle(Color.secondary)
        } else if let ftp = ftpCredentials {
            LabeledContent("Username") {
                Text(ftp.username)
                    .textSelection(.enabled)
            }

            HStack {
                Text("Password")
                Spacer()
                if let password = ftpPassword {
                    Text(password)
                        .font(.body.monospaced())
                        .foregroundStyle(Color.primary)
                    Button {
                        ftpPassword = nil
                    } label: {
                        Image(systemName: "eye.slash")
                            .font(.subheadline)
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Color.accentColor)
                    Button {
                        copyToClipboard(password, item: .ftpPassword)
                    } label: {
                        Image(systemName: copiedItem == .ftpPassword ? "checkmark" : "doc.on.doc")
                            .font(.subheadline)
                            .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(copiedItem == .ftpPassword ? Color.green : Color.accentColor)
                } else {
                    Button {
                        Task { await revealPassword() }
                    } label: {
                        if isRevealingPassword {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: "eye")
                                .font(.subheadline)
                        }
                    }
                    .buttonStyle(.borderless)
                    .disabled(isRevealingPassword)
                }
            }
        } else {
            HStack {
                Text("Loading credentials...")
                    .foregroundStyle(Color.secondary)
                Spacer()
                ProgressView()
                    .controlSize(.small)
            }
        }
    }

    // MARK: - Image Pipeline Section

    @ViewBuilder
    private var imagePipelineSection: some View {
        if let settings = pipelineSettings {
            NavigationLink {
                ImagePipelineView(
                    eventId: eventId,
                    initialSettings: settings,
                    onSave: { newSettings in
                        pipelineSettings = newSettings
                    }
                )
            } label: {
                Text("Color Grading & Auto-Edit")
            }
        } else {
            HStack {
                Text("Color Grading & Auto-Edit")
                    .foregroundStyle(Color.secondary)
                Spacer()
                ProgressView()
                    .controlSize(.small)
            }
        }
    }

    // MARK: - Info Section

    @ViewBuilder
    private func infoSection(event: Event) -> some View {
        LabeledContent("Created", value: event.createdAt.formattedDateTime())
        LabeledContent("Expires", value: event.expiresAt.formattedDateTime())

        if let startDate = event.startDate {
            LabeledContent("Start Date", value: startDate.formattedDateTime())
        }

        if let endDate = event.endDate {
            LabeledContent("End Date", value: endDate.formattedDateTime())
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
                Task { await loadAllData() }
            } label: {
                Text("Retry")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Data Loading

    private func loadAllData() async {
        isFirstLoad = event == nil
        error = nil

        async let eventFetch = repository.fetchEvent(id: eventId)
        async let ftpFetch: FtpCredentials? = {
            try? await repository.fetchFtpCredentials(eventId: eventId)
        }()
        async let pipelineFetch: ImagePipelineResponse? = {
            try? await repository.fetchImagePipeline(eventId: eventId)
        }()
        async let minimumDelay: () = Task.sleep(nanoseconds: 300_000_000)

        do {
            let eventResult = try await eventFetch
            let ftpResult = await ftpFetch
            let pipelineResult = await pipelineFetch
            try? await minimumDelay

            event = eventResult.value.data

            if let ftp = ftpResult {
                ftpCredentials = ftp
                ftpNotConfigured = false
            } else {
                ftpNotConfigured = true
            }

            pipelineSettings = pipelineResult?.data
        } catch {
            try? await minimumDelay
            print("[EventDetail Error] Failed to load event \(eventId): \(error.localizedDescription)")
            self.error = error
        }

        isFirstLoad = false
    }

    private func uploadLoop() async {
        while !Task.isCancelled {
            let summary = await coordinator.uploadManager.eventSummaries(eventIds: [eventId])
            await MainActor.run {
                self.uploadSummary = summary[eventId]
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
    }

    // MARK: - Actions

    private func revealPassword() async {
        isRevealingPassword = true
        do {
            let result = try await repository.revealFtpPassword(eventId: eventId)
            ftpPassword = result.password
        } catch {
            print("[EventDetail Error] Failed to reveal password: \(error.localizedDescription)")
        }
        isRevealingPassword = false
    }

    private func saveField(_ field: EditableField, value: String) async {
        isSavingEdit = true
        let input: UpdateEventInput
        switch field {
        case .name:
            input = UpdateEventInput(name: value, subtitle: nil)
        case .subtitle:
            input = UpdateEventInput(name: nil, subtitle: value)
        }

        do {
            let result = try await repository.updateEvent(id: eventId, input: input)
            event = result.data
            editField = nil
        } catch {
            print("[EventDetail Error] Failed to update event: \(error.localizedDescription)")
        }
        isSavingEdit = false
    }

    // MARK: - Helpers

    private func searchURL(for event: Event) -> String {
        let frontendURL = Bundle.main.object(forInfoDictionaryKey: "EventFrontendURL") as? String ?? "https://sabaipics.com"
        return "\(frontendURL)/participant/events/\(event.id)/search"
    }

    private func slideshowURL(for event: Event) -> String {
        let frontendURL = Bundle.main.object(forInfoDictionaryKey: "EventFrontendURL") as? String ?? "https://sabaipics.com"
        return "\(frontendURL)/participant/events/\(event.id)/slideshow"
    }

    private func copyToClipboard(_ text: String, item: CopyableItem) {
        UIPasteboard.general.string = text

        withAnimation {
            copiedItem = item
        }

        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation {
                if copiedItem == item {
                    copiedItem = nil
                }
            }
        }
    }
}

// MARK: - Editable Field

enum EditableField: Identifiable {
    case name
    case subtitle

    var id: String {
        switch self {
        case .name: return "name"
        case .subtitle: return "subtitle"
        }
    }

    var title: String {
        switch self {
        case .name: return "Name"
        case .subtitle: return "Subtitle"
        }
    }
}

// MARK: - Edit Field Sheet

private struct EditFieldSheet: View {
    let field: EditableField
    @Binding var value: String
    @Binding var isSaving: Bool
    let onSave: (String) async -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                TextField(field.title, text: $value)
                    .autocorrectionDisabled()
            }
            .navigationTitle("Edit \(field.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await onSave(value) }
                    } label: {
                        if isSaving {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Stat Card

private struct EventDetailStatCard: View {
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

// MARK: - Copyable Item

private enum CopyableItem: Equatable {
    case searchLink
    case slideshowLink
    case ftpPassword
}

// MARK: - Previews

#Preview("1. Skeleton Loading") {
    NavigationStack {
        EventDetailSkeletonPreview()
    }
}

#Preview("2. Full Event") {
    NavigationStack {
        EventDetailFullPreview()
    }
}

#Preview("3. Minimal Event") {
    NavigationStack {
        EventDetailMinimalPreview()
    }
}

#Preview("4. Error State") {
    NavigationStack {
        EventDetailErrorPreview()
    }
}

// MARK: - Preview Helpers

private struct EventDetailSkeletonPreview: View {
    var body: some View {
        List {
            Section("Upload Activity") {
                HStack(spacing: 12) {
                    EventDetailStatCard(icon: "clock.arrow.circlepath", iconTint: .orange, title: "Pending", value: "0")
                    EventDetailStatCard(icon: "checkmark.circle", iconTint: .green, title: "Completed", value: "0")
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section("Details") {
                LabeledContent("Name", value: "Loading Event Name")
                LabeledContent("Subtitle", value: "Loading subtitle")
            }

            Section("Links") {
                HStack {
                    Label("Search Link", systemImage: "magnifyingglass")
                    Spacer()
                    Image(systemName: "doc.on.doc").font(.subheadline)
                }
                HStack {
                    Label("Slideshow Link", systemImage: "play.rectangle")
                    Spacer()
                    Image(systemName: "doc.on.doc").font(.subheadline)
                }
            }

            Section("FTP") {
                LabeledContent("Username", value: "ftp_loading")
                LabeledContent("Password", value: "Reveal")
            }

            Section {
                Text("Color Grading & Auto-Edit")
            }

            Section("Info") {
                LabeledContent("Created", value: "Jan 1, 2026")
                LabeledContent("Expires", value: "Mar 1, 2026")
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .disabled(true)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EventDetailFullPreview: View {
    var body: some View {
        List {
            Section("Upload Activity") {
                HStack(spacing: 12) {
                    EventDetailStatCard(icon: "clock.arrow.circlepath", iconTint: .orange, title: "Pending", value: "3")
                    EventDetailStatCard(icon: "checkmark.circle", iconTint: .green, title: "Completed", value: "42")
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section("Details") {
                LabeledContent("Name", value: "Wedding - Bangkok Grand Hotel")
                LabeledContent("Subtitle", value: "John & Jane's Special Day")
            }

            Section("Links") {
                HStack {
                    Label("Search Link", systemImage: "magnifyingglass")
                    Spacer()
                    Image(systemName: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundStyle(Color.accentColor)
                }
                HStack {
                    Label("Slideshow Link", systemImage: "play.rectangle")
                    Spacer()
                    Image(systemName: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundStyle(Color.accentColor)
                }
            }

            Section("FTP") {
                LabeledContent("Username", value: "ABCDE")
                HStack {
                    Text("Password")
                    Spacer()
                    Button("Reveal") {}
                        .font(.subheadline)
                        .buttonStyle(.borderless)
                }
            }

            Section {
                Text("Color Grading & Auto-Edit")
            }

            Section("Info") {
                LabeledContent("Created", value: "Jan 27, 2026 at 10:30 AM")
                LabeledContent("Expires", value: "Mar 14, 2026 at 11:59 PM")
                LabeledContent("Start Date", value: "Feb 14, 2026 at 6:00 PM")
                LabeledContent("End Date", value: "Feb 14, 2026 at 11:00 PM")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Copy Search Link") {}
                    Button("Copy Slideshow Link") {}
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }
}

private struct EventDetailMinimalPreview: View {
    var body: some View {
        List {
            Section("Upload Activity") {
                HStack(spacing: 12) {
                    EventDetailStatCard(icon: "clock.arrow.circlepath", iconTint: .orange, title: "Pending", value: "0")
                    EventDetailStatCard(icon: "checkmark.circle", iconTint: .green, title: "Completed", value: "0")
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)
            }

            Section("Details") {
                LabeledContent("Name", value: "Minimal Event")
                LabeledContent("Subtitle") {
                    Text("No subtitle")
                        .foregroundStyle(Color.secondary)
                }
            }

            Section("Links") {
                HStack {
                    Label("Search Link", systemImage: "magnifyingglass")
                    Spacer()
                    Image(systemName: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundStyle(Color.accentColor)
                }
                HStack {
                    Label("Slideshow Link", systemImage: "play.rectangle")
                    Spacer()
                    Image(systemName: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundStyle(Color.accentColor)
                }
            }

            Section("FTP") {
                Text("Not configured")
                    .foregroundStyle(Color.secondary)
            }

            Section {
                HStack {
                    Text("Color Grading & Auto-Edit")
                        .foregroundStyle(Color.secondary)
                    Spacer()
                    ProgressView().controlSize(.small)
                }
            }

            Section("Info") {
                LabeledContent("Created", value: "Jan 20, 2026 at 2:15 PM")
                LabeledContent("Expires", value: "Apr 1, 2026 at 11:59 PM")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
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
