//  CaptureHomeView.swift
//  FrameFast

import SwiftUI

struct CaptureHomeView: View {
    let onConnectNew: (CameraManufacturer) -> Void
    let recentSony: [APCameraConnectionRecord]
    var recentCanon: [APCameraConnectionRecord] = []
    var recentNikon: [APCameraConnectionRecord] = []
    let onReconnect: (_ manufacturer: String, _ id: String) -> Void
    var onRemoveRecent: (_ manufacturer: String, _ id: UUID) -> Void = { _, _ in }
    var isConnectionMuted: Bool = false

    var body: some View {
        List {
            Section {
                Menu {
                    ForEach(CameraManufacturer.allCases, id: \.self) { manufacturer in
                        Button(manufacturer.rawValue) {
                            onConnectNew(manufacturer)
                        }
                    }
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
                            onReconnect("sony", record.id.uuidString)
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
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                onRemoveRecent("sony", record.id)
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                            .tint(Color.Theme.destructive)
                        }
                    }
                }
            }

            Section("Recent Canon") {
                if recentCanon.isEmpty {
                    Text("No recent Canon cameras yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recentCanon) { record in
                        Button {
                            onReconnect("canon", record.id.uuidString)
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
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                onRemoveRecent("canon", record.id)
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                            .tint(Color.Theme.destructive)
                        }
                    }
                }
            }

            Section("Recent Nikon") {
                if recentNikon.isEmpty {
                    Text("No recent Nikon cameras yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recentNikon) { record in
                        Button {
                            onReconnect("nikon", record.id.uuidString)
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
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                onRemoveRecent("nikon", record.id)
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                            .tint(Color.Theme.destructive)
                        }
                    }
                }
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
            onConnectNew: { _ in },
            recentSony: [],
            onReconnect: { _, _ in }
        )
    }
}

#endif
