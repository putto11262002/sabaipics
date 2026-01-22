//
//  EventsHomeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//

import SwiftUI

struct EventsHomeView: View {
    @AppStorage("selectedEventId") private var selectedEventId: String = ""
    @State private var draftEventId: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Current") {
                    if selectedEventId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("No event selected")
                            .foregroundStyle(.secondary)
                    } else {
                        Text(selectedEventId)
                            .font(.footnote)
                    }
                }

                Section("Set Event (Temporary)") {
                    TextField("Event ID", text: $draftEventId)

                    Button("Use This Event") {
                        selectedEventId = draftEventId.trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                    .disabled(draftEventId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Clear Selected Event", role: .destructive) {
                        selectedEventId = ""
                    }
                    .disabled(selectedEventId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section {
                    Text("Next: this screen becomes the real Events list + selection UI (settings-style list) backed by GET /events.")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
            }
            .navigationTitle("Events")
        }
        .onAppear {
            if draftEventId.isEmpty {
                draftEventId = selectedEventId
            }
        }
    }
}
