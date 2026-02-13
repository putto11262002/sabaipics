//  CaptureHomeView.swift
//  FrameFast

import SwiftUI

#if os(iOS)
import UIKit
#endif

struct CaptureHomeView: View {
    let onAddCameraTap: () -> Void
    let recentCameras: [APCameraConnectionRecord]
    let onReconnect: (_ manufacturer: CameraManufacturer, _ id: UUID) -> Void
    var onRemoveRecent: (_ manufacturer: CameraManufacturer, _ id: UUID) -> Void = { _, _ in }
    var isConnectionMuted: Bool = false

    var body: some View {
        VStack(spacing: 10) {
            headerRow
                .padding(.horizontal, 20)
                .padding(.top, 10)

            List {
                if isConnectionMuted {
                    Section {
                        Text("Disconnect the current camera to connect another.")
                            .foregroundStyle(Color.Theme.mutedForeground)
                            .sabaiCardRow()
                    }
                }

                Section("Recent cameras") {
                    if recentCameras.isEmpty {
                        Text("No recent cameras yet")
                            .foregroundStyle(.secondary)
                            .sabaiCardRow()
                    } else {
                        ForEach(recentCameras) { record in
                            Button {
                                onReconnect(record.manufacturer, record.id)
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 8) {
                                            Text(record.cameraName)
                                                .font(.body)
                                                .foregroundStyle(Color.Theme.foreground)

                                            ManufacturerBadge(manufacturer: record.manufacturer)
                                        }
                                    }

                                    Spacer(minLength: 0)

                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .disabled(isConnectionMuted)
                            .buttonStyle(.plain)
                            .sabaiCardRow()
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    onRemoveRecent(record.manufacturer, record.id)
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                                .tint(Color.Theme.destructive)
                            }
                        }
                    }
                }
            }
        }
        #if os(iOS)
        // Match the grouped List background so the header/button area
        // doesn't look like a different screen.
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        #endif
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerRow: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Cameras")
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(Color.Theme.foreground)

            Spacer(minLength: 0)

            Button {
                guard !isConnectionMuted else { return }
                onAddCameraTap()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(Color.Theme.primaryForeground)
                    .background(Color.Theme.primary, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            // Align the circle with the large-title baseline more naturally.
            .alignmentGuide(.firstTextBaseline) { d in
                d[.bottom] - 6
            }
            .disabled(isConnectionMuted)
            .opacity(isConnectionMuted ? 0.5 : 1.0)
            .accessibilityLabel("Add camera")
        }
    }
}

private struct ManufacturerBadge: View {
    let manufacturer: CameraManufacturer

    var body: some View {
        Text(manufacturer.rawValue)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Color.Theme.mutedForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.Theme.muted)
            .clipShape(Capsule())
    }
}

#if DEBUG

#Preview("Capture Home") {
    NavigationStack {
        CaptureHomeView(
            onAddCameraTap: { },
            recentCameras: [],
            onReconnect: { _, _ in }
        )
    }
}

#endif
