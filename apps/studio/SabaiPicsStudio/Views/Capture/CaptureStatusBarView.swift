//  CaptureStatusBarView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureStatusBarView: View {
    enum Status: Equatable {
        case connecting
        case active
        case error(String)
    }

    let status: Status
    let cameraName: String
    let downloadsCount: Int
    let lastFilename: String?
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
                }
            }

            Spacer(minLength: 10)

            Button {
                onDisconnect()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .background(Color.Theme.destructive.opacity(0.12))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.Theme.destructive.opacity(0.35), lineWidth: 1)
            )
            .foregroundStyle(Color.Theme.destructive)
            .accessibilityLabel("Disconnect")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.Theme.border, lineWidth: 1)
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
            if let lastFilename, !lastFilename.isEmpty {
                return "\(downloadsCount) saved • \(lastFilename)"
            }
            return "\(downloadsCount) saved"
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
            return "Capture session active. \(downloadsCount) saved."
        case .error(let message):
            return "Capture session error. \(message)"
        }
    }
}

#if DEBUG

#Preview("Capture Status Bar") {
    VStack {
        Spacer()
        CaptureStatusBarView(
            status: .active,
            cameraName: "Sony A7 IV",
            downloadsCount: 12,
            lastFilename: "DSC01234.JPG",
            onOpen: {},
            onDisconnect: {}
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }
    .frame(maxWidth: .infinity)
    .background(Color.Theme.background)
}

#endif
