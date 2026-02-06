//  PhotoListRow.swift
//  SabaiPicsStudio
//
//  Photo row for capture session lists.

import SwiftUI

struct PhotoListRow: View {
    @ObservedObject var photo: CapturedPhoto

    var body: some View {
        HStack(spacing: 12) {
            if let image = photo.image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 60, height: 60)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color.Theme.muted)
                    .frame(width: 60, height: 60)
                    .cornerRadius(8)
                    .overlay(
                        ProgressView()
                    )
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(photo.name)
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)
                    .lineLimit(1)

                let displaySize = photo.data.isEmpty ? photo.fileSize : photo.data.count
                Text("\(formatFileSize(displaySize)) · \(formatRelativeTime(photo.captureDate))")
                    .font(.caption)
                    .foregroundColor(Color.Theme.mutedForeground)
            }

            Spacer()

            downloadStatusView
        }
    }

    @ViewBuilder
    private var downloadStatusView: some View {
        switch photo.status {
        case .downloading:
            ProgressView()
                .scaleEffect(0.8)

        case .completed:
            Image(systemName: "arrow.down.circle.fill")
                .foregroundColor(Color.Theme.primary)
                .font(.title3)

        case .failed:
            VStack(alignment: .trailing, spacing: 2) {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundColor(Color.Theme.destructive)
                    .font(.title3)
                Text("Failed")
                    .font(.caption2)
                    .foregroundColor(Color.Theme.destructive)
            }
        }
    }

    private func formatFileSize(_ bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useKB]
        formatter.countStyle = .file
        formatter.includesUnit = true
        formatter.isAdaptive = true
        return formatter.string(fromByteCount: Int64(bytes))
    }

    private func formatRelativeTime(_ date: Date) -> String {
        let now = Date()
        let interval = now.timeIntervalSince(date)

        if interval < 10 {
            return "just now"
        } else if interval < 60 {
            return "\(Int(interval))s ago"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
}
