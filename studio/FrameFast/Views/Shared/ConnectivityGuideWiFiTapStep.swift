//
//  ConnectivityGuideWiFiTapStep.swift
//  FrameFast
//
//  Step 1 of the connectivity guide — tap ⓘ on your camera network.
//  Uses real NavigationStack + List so Liquid Glass auto-applies on iOS 26.
//

import SwiftUI

struct ConnectivityGuideWiFiTapStep: View {
    @State private var pulse1 = false
    @State private var pulse2 = false
    @State private var mockOpacity: Double = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrow

            mockContent
                .padding(.top, 16)

            instruction
                .padding(.top, 24)
        }
        .onAppear {
            withAnimation(.easeIn(duration: 0.5)) { mockOpacity = 1.0 }
            startPulse()
        }
    }

    // MARK: - Eyebrow

    private var eyebrow: some View {
        HStack(spacing: 4) {
            Text("Settings")
            Image(systemName: "chevron.right")
                .imageScale(.small)
                .fontWeight(.semibold)
            Text("Wi‑Fi")
        }
        .font(.subheadline)
        .foregroundStyle(.primary)
    }

    // MARK: - Mock Content

    private var mockContent: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    Toggle("Wi‑Fi", isOn: .constant(true))
                }

                Section {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color(.systemBlue))
                            .frame(width: 20, alignment: .center)

                        Text(verbatim: "DIRECT‑Sony‑A7")

                        Spacer()

                        HStack(spacing: 7) {
                            Image(systemName: "lock.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)

                            Image(systemName: "wifi")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.secondary)

                            tapBeacon
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDisabled(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .opacity(mockOpacity)
    }

    // MARK: - Tap Beacon

    private var tapBeacon: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemBlue).opacity(0.5), lineWidth: 1.5)
                .frame(width: 22, height: 22)
                .scaleEffect(pulse1 ? 2.6 : 1.0)
                .opacity(pulse1 ? 0 : 1)

            Circle()
                .stroke(Color(.systemBlue).opacity(0.35), lineWidth: 1.5)
                .frame(width: 22, height: 22)
                .scaleEffect(pulse2 ? 2.6 : 1.0)
                .opacity(pulse2 ? 0 : 1)

            Image(systemName: "info.circle")
                .font(.body)
                .foregroundStyle(Color(.systemBlue))
        }
    }

    // MARK: - Instruction

    private var instruction: some View {
        Group {
            Text("Tap ") +
            Text(Image(systemName: "info.circle"))
                .foregroundStyle(Color(.systemBlue)) +
            Text(" next to your camera network")
        }
        .font(.title3.weight(.semibold))
        .foregroundStyle(.primary)
    }

    // MARK: - Animations

    private func startPulse() {
        withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
            pulse1 = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) {
            withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
                pulse2 = true
            }
        }
    }
}

#if DEBUG
#Preview("WiFi Tap Step — Dark") {
    ZStack {
        Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideWiFiTapStep()
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
}

#Preview("WiFi Tap Step — Light") {
    ZStack {
        Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideWiFiTapStep()
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.light)
}
#endif
