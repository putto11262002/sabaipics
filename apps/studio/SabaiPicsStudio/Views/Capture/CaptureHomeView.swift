//  CaptureHomeView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureHomeView: View {
    let onConnectNew: () -> Void
    let recentSony: [SonyAPConnectionRecord]
    let onReconnect: (_ manufacturer: String, _ id: String) -> Void
    var isConnectionMuted: Bool = false

    var body: some View {
        List {
            Section {
                Button {
                    onConnectNew()
                } label: {
                    Label {
                        Text("Connect new camera")
                    } icon: {
                        Image(systemName: "camera.fill")
                            .symbolRenderingMode(.hierarchical)
                            .imageScale(.medium)
                    }
                }
                .disabled(isConnectionMuted)
            }

            if isConnectionMuted {
                Section {
                    Text("Disconnect the current camera to connect another.")
                        .foregroundStyle(Color.Theme.mutedForeground)
                }
            }

            Section("Recent Sony") {
                if recentSony.isEmpty {
                    Text("No recent Sony cameras yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recentSony) { record in
                        Button {
                            onReconnect("sony", record.id)
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(record.cameraName)
                                        .foregroundStyle(Color.Theme.foreground)
                                        .lineLimit(1)
                                }

                                Spacer(minLength: 0)

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(isConnectionMuted)
                        .buttonStyle(.plain)
                        .padding(.vertical, 2)
                    }
                }
            }

            Section("Recent Canon") {
                Text("No recent Canon cameras yet")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Capture")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#if DEBUG

#Preview("Capture Home") {
    NavigationStack {
        CaptureHomeView(
            onConnectNew: {},
            recentSony: [],
            onReconnect: { _, _ in }
        )
    }
}

#endif
