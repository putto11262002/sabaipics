//
//  ConnectivityGuideIPv4Step.swift
//  FrameFast
//
//  Step 2 of the connectivity guide — note IP and subnet, then tap Configure IP.
//  Uses real NavigationStack + List so Liquid Glass auto-applies on iOS 26.
//  Phase 1: highlights IP Address + Subnet Mask rows (note these values).
//  Phase 2: beacon on Configure IP chevron (tap here).
//

import SwiftUI
import UIKit

struct ConnectivityGuideIPv4Step: View {

    let ipAddress: String
    let subnetMask: String

    private enum Phase { case highlightValues, tapConfigureIP }

    @State private var phase: Phase = .highlightValues
    @State private var beaconCycle = 0
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
            startPhaseLoop()
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
            Image(systemName: "chevron.right")
                .imageScale(.small)
                .fontWeight(.semibold)
            Text("Network Details")
        }
        .font(.subheadline)
        .foregroundStyle(.primary)
    }

    // MARK: - Mock Content (real system components)

    private var mockContent: some View {
        VStack(spacing: 0) {
            List {
                // IPV4 ADDRESS section
                Section("IPV4 ADDRESS") {
                    // Configure IP row with beacon
                    HStack {
                        Text("Configure IP")
                        Spacer()
                        HStack(spacing: 6) {
                            Text("Automatic")
                                .foregroundStyle(.secondary)
                            ZStack {
                                PulseBeacon()
                                    .id(beaconCycle)
                                    .opacity(phase == .tapConfigureIP ? 1 : 0)
                                    .animation(.easeInOut(duration: 0.35), value: phase)

                                Image(systemName: "chevron.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(Color(uiColor: UIColor.tertiaryLabel))
                            }
                        }
                    }

                    // IP Address — highlighted in phase 1
                    HStack {
                        Text("IP Address")
                        Spacer()
                        Text(verbatim: ipAddress)
                            .foregroundStyle(phase == .highlightValues ? Color(.systemBlue) : .secondary)
                            .guideHighlight(active: phase == .highlightValues, scale: 1.15, frequency: 0.4)
                    }

                    // Subnet Mask — highlighted in phase 1
                    HStack {
                        Text("Subnet Mask")
                        Spacer()
                        Text(verbatim: subnetMask)
                            .foregroundStyle(phase == .highlightValues ? Color(.systemBlue) : .secondary)
                            .guideHighlight(active: phase == .highlightValues, scale: 1.15, frequency: 0.4)
                    }

                    // Router — plain
                    HStack {
                        Text("Router")
                        Spacer()
                        Text(verbatim: "192.168.1.2")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDisabled(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .opacity(mockOpacity)
    }

    // MARK: - Instruction

    private var instruction: some View {
        Group {
            switch phase {
            case .highlightValues:
                Text("Note your **IP Address** and **Subnet Mask**")
            case .tapConfigureIP:
                Text("Then tap **Configure IP**")
            }
        }
        .font(.title3)
        .foregroundStyle(.primary)
        .animation(.easeInOut(duration: 0.3), value: phase)
    }

    // MARK: - Animations

    private func startPhaseLoop() {
        Task { @MainActor in
            while true {
                // Fade in
                withAnimation(.easeIn(duration: 0.4)) { mockOpacity = 1.0 }

                withAnimation(.easeInOut(duration: 0.35)) { phase = .highlightValues }
                try? await Task.sleep(nanoseconds: 3_800_000_000)

                beaconCycle += 1
                withAnimation(.easeInOut(duration: 0.35)) { phase = .tapConfigureIP }
                try? await Task.sleep(nanoseconds: 2_500_000_000)

                // Fade out
                withAnimation(.easeOut(duration: 0.3)) { mockOpacity = 0 }
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
        }
    }
}

// MARK: - Pulse Beacon

private struct PulseBeacon: View {
    @State private var pulse1 = false
    @State private var pulse2 = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemBlue).opacity(0.5), lineWidth: 1.5)
                .frame(width: 20, height: 20)
                .scaleEffect(pulse1 ? 2.6 : 1.0)
                .opacity(pulse1 ? 0 : 1)

            Circle()
                .stroke(Color(.systemBlue).opacity(0.35), lineWidth: 1.5)
                .frame(width: 20, height: 20)
                .scaleEffect(pulse2 ? 2.6 : 1.0)
                .opacity(pulse2 ? 0 : 1)
        }
        .onAppear {
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
}

#if DEBUG
#Preview("IPv4 Step — Dark") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideIPv4Step(ipAddress: "192.168.1.10", subnetMask: "255.255.255.0")
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
}

#Preview("IPv4 Step — Light") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideIPv4Step(ipAddress: "192.168.1.10", subnetMask: "255.255.255.0")
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.light)
}
#endif
