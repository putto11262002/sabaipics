//
//  ConnectivityGuideOnlineCheckStep.swift
//  FrameFast
//
//  Step 4 of the connectivity guide — success only.
//  Navigated to automatically by ConnectivityGuideFlow when isOnline becomes true.
//  Spring-in green checkmark → haptic → 2.5s hold → onDone().
//  Uses only native iOS semantic colors — safe for Liquid Glass (iOS 26+).
//

import SwiftUI
import UIKit

struct ConnectivityGuideOnlineCheckStep: View {
    let onSuccess: () -> Void  // tells container to hide prev button
    let onDone: () -> Void     // exits the guide after success pause

    @State private var successScale: CGFloat = 0.3
    @State private var successOpacity: Double = 0

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            indicator
            statusText
            Spacer()
        }
        .onAppear { enterSuccess() }
    }

    // MARK: - Indicator

    private var indicator: some View {
        ZStack {
            Circle()
                .fill(Color(.systemGreen))
                .frame(width: 68, height: 68)
                .scaleEffect(successScale)
                .opacity(successOpacity)

            Image(systemName: "checkmark")
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .scaleEffect(successScale)
                .opacity(successOpacity)
        }
    }

    // MARK: - Status Text

    private var statusText: some View {
        Text("Connected")
            .font(.body)
            .fontWeight(.semibold)
            .foregroundStyle(Color(.systemGreen))
    }

    // MARK: - Success

    private func enterSuccess() {
        onSuccess()
        withAnimation(.spring(duration: 0.5, bounce: 0.25)) {
            successScale = 1.0
            successOpacity = 1.0
        }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            onDone()
        }
    }
}

#if DEBUG
#Preview("Online Check — Success (Dark)") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideOnlineCheckStep(onSuccess: {}, onDone: {})
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
}

#Preview("Online Check — Success (Light)") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideOnlineCheckStep(onSuccess: {}, onDone: {})
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.light)
}
#endif
