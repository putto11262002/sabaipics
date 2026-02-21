//  CaptureStatusBarView.swift
//  FrameFast

import SwiftUI

struct CaptureStatusBarView: View {
    enum Status: Equatable {
        case connecting
        case active
        case error(String)
    }

    let status: Status
    let cameraName: String
    let eventName: String?
    let onOpen: () -> Void
    let onDisconnect: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                statusIcon

                VStack(alignment: .leading, spacing: 2) {
                    Text(cameraName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.Theme.foreground)
                        .lineLimit(1)

                    Text(subtitleText)
                        .font(.caption)
                        .foregroundStyle(Color.Theme.mutedForeground)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }

            Spacer(minLength: 10)

            Button {
                onDisconnect()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.Theme.destructive)
            .accessibilityLabel("Disconnect")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .shadow(color: Color.Theme.foreground.opacity(0.08), radius: 10, x: 0, y: 4)
        .contentShape(Rectangle())
        .onTapGesture {
            onOpen()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var subtitleText: String {
        switch status {
        case .connecting:
            return "Working…"
        case .active:
            if let eventName, !eventName.isEmpty {
                return eventName
            }
            return "Tap to view"
        case .error(let message):
            return message
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .connecting:
            ProgressView()
                .controlSize(.small)
        case .active:
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.Theme.success)
        case .error:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.Theme.destructive)
        }
    }

    private var accessibilityLabel: String {
        switch status {
        case .connecting:
            return "Capture session. Working."
        case .active:
            return "Capture session active."
        case .error(let message):
            return "Capture session error. \(message)"
        }
    }
}

#if DEBUG

#Preview("Capture Status Bar") {
    TabView {
        NavigationStack {
            Color.clear
                .navigationTitle("Capture")
                .navigationBarTitleDisplayMode(.large)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            CaptureStatusBarView(
                status: .active,
                cameraName: "Sony A7 IV",
                eventName: "Bangkok Wedding",
                onOpen: {},
                onDisconnect: {}
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .tabItem { Label("Capture", systemImage: "camera.circle.fill") }

        Color.clear
            .tabItem { Label("Events", systemImage: "calendar") }

        Color.clear
            .tabItem { Label("Profile", systemImage: "person.crop.circle") }
    }
    .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
}

#endif
