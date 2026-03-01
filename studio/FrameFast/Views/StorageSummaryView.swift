//  StorageSummaryView.swift
//  FrameFast
//
//  Created: 2026-03-01
//

import SwiftUI

struct StorageSummaryView: View {
    @StateObject private var store: StorageSummaryStore
    @State private var retentionPeriod = SpoolRetentionConfig.period

    init(uploadQueueStore: UploadQueueStore, fileService: SpoolFileService, coordinator: AppCoordinator) {
        _store = StateObject(wrappedValue: StorageSummaryStore(store: uploadQueueStore, fileService: fileService, coordinator: coordinator))
    }

    var body: some View {
        List {
            if let summary = store.summary {
                overviewSection(summary: summary)
                byStatusSection(summary: summary)
                retentionSection
                actionsSection(summary: summary)
            } else if store.isLoading {
                skeletonSection
            }
        }
        .listStyle(.insetGrouped)
        #if os(iOS)
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        #endif
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.large)
        .onAppear {
            store.refresh()
        }
    }

    // MARK: - Sections

    private func overviewSection(summary: StorageSummary) -> some View {
        Section("Overview") {
            storageRow(
                title: "Total Storage Used",
                systemImage: "internaldrive",
                bytes: store.diskUsage,
                files: summary.totalFiles
            )
        }
    }

    private func byStatusSection(summary: StorageSummary) -> some View {
        Section("By Status") {
            storageRow(
                title: "Uploaded",
                systemImage: "checkmark.circle",
                bytes: summary.completedBytes,
                files: summary.completedFiles,
                tint: .green
            )
            storageRow(
                title: "Pending",
                systemImage: "clock",
                bytes: summary.pendingBytes,
                files: summary.pendingFiles,
                tint: .accentColor
            )
            storageRow(
                title: "Failed",
                systemImage: "exclamationmark.triangle",
                bytes: summary.failedBytes,
                files: summary.failedFiles,
                tint: .red
            )
        }
    }

    private var retentionSection: some View {
        Section("Retention") {
            Picker(selection: $retentionPeriod) {
                ForEach(SpoolRetentionConfig.Period.allCases, id: \.self) { period in
                    Text(period.displayName).tag(period)
                }
            } label: {
                Label("Retention Period", systemImage: "calendar.badge.clock")
                    .font(.body)
            }
            .onChange(of: retentionPeriod) { _, newValue in
                SpoolRetentionConfig.period = newValue
            }
        }
    }

    private func actionsSection(summary: StorageSummary) -> some View {
        let isClearingCompleted = store.activeCleanup == .completed
        let isClearingFailed = store.activeCleanup == .failed
        let isAnyCleanup = store.activeCleanup != nil

        return Section("Actions") {
            Button(role: .destructive) {
                store.clearCompleted()
            } label: {
                HStack(spacing: 12) {
                    if isClearingCompleted {
                        ProgressView()
                    } else {
                        Image(systemName: "trash")
                            .foregroundStyle(.red)
                    }
                    Text("Clear Uploaded Photos")
                        .font(.body)
                        .foregroundStyle(.red)
                    Spacer()
                    if !isClearingCompleted, summary.completedFiles > 0 {
                        Text("\(summary.completedFiles)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.red)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(isAnyCleanup || summary.completedFiles == 0)
            .opacity(summary.completedFiles == 0 ? 0.5 : 1)

            Button(role: .destructive) {
                store.clearFailed()
            } label: {
                HStack(spacing: 12) {
                    if isClearingFailed {
                        ProgressView()
                    } else {
                        Image(systemName: "trash")
                            .foregroundStyle(.red)
                    }
                    Text("Clear Failed Photos")
                        .font(.body)
                        .foregroundStyle(.red)
                    Spacer()
                    if !isClearingFailed, summary.failedFiles > 0 {
                        Text("\(summary.failedFiles)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.red)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(isAnyCleanup || summary.failedFiles == 0)
            .opacity(summary.failedFiles == 0 ? 0.5 : 1)
        }
    }

    private var skeletonSection: some View {
        Section {
            ForEach(0..<3, id: \.self) { _ in
                HStack {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.15))
                        .frame(width: 120, height: 14)
                    Spacer()
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.15))
                        .frame(width: 60, height: 14)
                }
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Helpers

    private func storageRow(
        title: String,
        systemImage: String,
        bytes: Int64,
        files: Int,
        tint: Color = .secondary
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)

            Text(title)
                .font(.body)

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(Self.formatBytes(bytes))
                    .font(.subheadline.weight(.semibold))
                Text("\(files) \(files == 1 ? "photo" : "photos")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}
