//
//  CreditsToolbarView.swift
//  FrameFast
//

import SwiftUI

struct CreditsToolbarView: View {
    @EnvironmentObject private var creditsStore: CreditsStore
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    var body: some View {
        switch creditsStore.state {
        case .pending:
            ProgressView()
                .controlSize(.mini)
                .accessibilityLabel("Loading credits")

        case .loaded(let balance):
            let isOffline = !connectivityStore.isOnline
            if isOffline {
                placeholderBadge
                    .accessibilityLabel("Credits offline")
            } else {
                HStack(spacing: 6) {
                    Image(systemName: "creditcard.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.Theme.success)
                    Text(balance.formatted(.number.notation(.compactName)))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.Theme.foreground)
                        .contentTransition(.numericText())
                        .animation(.default, value: balance)
                }
                .accessibilityLabel("\(balance) credits")
            }

        case .error:
            placeholderBadge
                .accessibilityLabel("Credits unavailable")
        }
    }

    private var placeholderBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "creditcard.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.Theme.mutedForeground)
            Text("-")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.Theme.mutedForeground)
        }
    }
}
