//  CanonAPSetupView.swift
//  FrameFast
//
//  Canon camera AP setup instructions.

import SwiftUI

struct CanonAPSetupView: View {
    let onNext: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "wifi")
                .font(.system(size: 48))
                .foregroundStyle(Color.Theme.primary)

            Text("Connect to Camera's WiFi")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Color.Theme.foreground)

            Text("Connect to your Canon camera's WiFi network (DIRECT-...) in **Settings** before continuing.")
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button("Continue") {
                onNext()
            }
            .buttonStyle(.compact)
            .padding(.top, 4)

            Spacer()
        }
    }
}

#if DEBUG

#Preview("Canon AP Setup") {
    NavigationStack {
        CanonAPSetupView(onNext: {})
    }
}

#endif
