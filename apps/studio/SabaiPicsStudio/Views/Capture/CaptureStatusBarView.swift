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
    let uploadedCount: Int
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

            PipelineCluster(downloadsCount: downloadsCount, uploadedCount: uploadedCount)

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
            return "Capture session active. \(downloadsCount) saved."
        case .error(let message):
            return "Capture session error. \(message)"
        }
    }
}

private struct PipelineCluster: View {
    let downloadsCount: Int
    let uploadedCount: Int

    var body: some View {
        HStack(spacing: 8) {
            clusterPill(icon: "arrow.down.circle.fill", text: "\(downloadsCount)")
                .foregroundStyle(Color.Theme.primary)

            uploadPill
        }
    }

    private var uploadPill: some View {
        let total = max(downloadsCount, 0)
        let uploaded = min(max(uploadedCount, 0), total)

        guard total > 0 else {
            return AnyView(EmptyView())
        }

        let tint: Color = Color.Theme.primary
        let isComplete = uploaded == total

        return AnyView(
            HStack(spacing: 6) {
                if !isComplete {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 12, weight: .semibold))
                }
                Text("\(uploaded)/\(total)")
                    .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(tint.opacity(0.10))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.25), lineWidth: 1))
            .foregroundStyle(tint)
            .accessibilityLabel("Uploads \(uploaded) of \(total)")
        )
    }

    private func clusterPill(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
            Text(text)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.Theme.primary.opacity(0.10))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Color.Theme.primary.opacity(0.25), lineWidth: 1))
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
            uploadedCount: 9,
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
