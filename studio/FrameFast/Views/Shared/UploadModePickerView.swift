//  UploadModePickerView.swift
//  FrameFast
//
//  Asks whether the user wants real-time uploads or offline shooting.
//  Shown between the manufacturer setup step and the connectivity guide.

import SwiftUI

struct UploadModePickerView: View {
    let onRealTime: () -> Void
    let onOffline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Choose how photos are handled during your shoot.")
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .padding(.horizontal, 20)
                .padding(.bottom, 32)

            VStack(spacing: 12) {
                modeCard(
                    icon: "icloud.and.arrow.up",
                    title: "Real-time upload",
                    description: "Photos upload as you shoot. Requires internet access.",
                    action: onRealTime
                )

                modeCard(
                    icon: "clock.arrow.circlepath",
                    title: "Shoot offline",
                    description: "Shoot now, upload later on a normal network.",
                    action: onOffline
                )
            }
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    // MARK: - Mode Card

    private func modeCard(
        icon: String,
        title: String,
        description: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(Color.Theme.primary)
                    .frame(width: 36, alignment: .center)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Color.Theme.foreground)

                    Text(description)
                        .font(.caption)
                        .foregroundColor(Color.Theme.mutedForeground)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
            .padding(16)
            .background(Color.Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.Theme.border, lineWidth: 1)
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
            onOffline: {}
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
            onOffline: {}
        )
        .navigationTitle("Upload Mode")
        .navigationBarTitleDisplayMode(.large)
    }
    .preferredColorScheme(.light)
}

#endif
