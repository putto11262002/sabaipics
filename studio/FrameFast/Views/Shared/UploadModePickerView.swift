//  UploadModePickerView.swift
//  FrameFast
//
//  Asks whether the user wants real-time uploads or offline shooting.
//  Shown between the event selection step and the connectivity guide / discovery.

import SwiftUI

struct UploadModePickerView: View {
    let onRealTime: () -> Void
    let onOffline: () -> Void
    let onProbeResult: (_ isOnline: Bool) -> Void

    @EnvironmentObject private var connectivityStore: ConnectivityStore

    @State private var isProbing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Choose how photos are handled during your shoot.")
                .font(.subheadline)
                .foregroundColor(Color.secondary)
                .padding(.horizontal, 20)
                .padding(.bottom, 32)

            VStack(spacing: 12) {
                modeCard(
                    icon: "icloud.and.arrow.up",
                    title: "Real-time upload",
                    description: "Photos upload as you shoot. Requires internet access.",
                    isLoading: isProbing
                ) {
                    guard !isProbing else { return }
                    isProbing = true
                    onRealTime()
                    Task {
                        let state = await connectivityStore.probeNow()
                        isProbing = false
                        onProbeResult(state.isOnline)
                    }
                }

                modeCard(
                    icon: "clock.arrow.circlepath",
                    title: "Shoot offline",
                    description: "Shoot now, upload later on a normal network.",
                    isLoading: false
                ) {
                    onOffline()
                }
            }
            .padding(.horizontal, 20)
            .disabled(isProbing)

            Spacer()
        }
    }

    // MARK: - Mode Card

    private func modeCard(
        icon: String,
        title: String,
        description: String,
        isLoading: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 36, alignment: .center)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Color.primary)

                    Text(description)
                        .font(.caption)
                        .foregroundColor(Color.secondary)
                }

                Spacer(minLength: 0)

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.secondary)
                }
            }
            .padding(16)
            .background(Color(UIColor.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color(UIColor.separator), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

#if DEBUG

#Preview("Upload Mode Picker — Dark") {
    NavigationStack {
        UploadModePickerView(
            onRealTime: {},
            onOffline: {},
            onProbeResult: { _ in }
        )
        .navigationTitle("Upload Mode")
        .navigationBarTitleDisplayMode(.large)
    }
    .preferredColorScheme(.dark)
}

#Preview("Upload Mode Picker — Light") {
    NavigationStack {
        UploadModePickerView(
            onRealTime: {},
            onOffline: {},
            onProbeResult: { _ in }
        )
        .navigationTitle("Upload Mode")
        .navigationBarTitleDisplayMode(.large)
    }
    .preferredColorScheme(.light)
}

#endif
