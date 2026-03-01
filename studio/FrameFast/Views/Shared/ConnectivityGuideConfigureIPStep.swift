//
//  ConnectivityGuideConfigureIPStep.swift
//  FrameFast
//
//  Step 3 of the connectivity guide — select Manual, type IP values, tap Save.
//  Uses real NavigationStack + List so Liquid Glass auto-applies on iOS 26.
//  Phase 1 — beacon on Manual, checkmark appears.
//  Phase 2 — typing animation into IP Address + Subnet Mask fields.
//  Phase 3 — beacon on Save.
//

import SwiftUI
import UIKit

struct ConnectivityGuideConfigureIPStep: View {

    let ipAddress: String
    let subnetMask: String

    private enum Phase { case selectManual, typeValues, tapSave }
    private enum ActiveField { case ip, subnet }

    @State private var phase: Phase = .selectManual
    @State private var manualSelected = false
    @State private var mockOpacity: Double = 0
    @State private var ipText = ""
    @State private var subnetText = ""
    @State private var activeField: ActiveField? = nil
    @State private var cursorVisible = true
    @State private var manualBeaconCycle = 0
    @State private var saveBeaconCycle = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrow

            mockContent
                .padding(.top, 16)

            instruction
                .padding(.top, 24)
        }
        .onAppear {
            startCursorBlink()
            startPhaseLoop()
        }
    }

    // MARK: - Eyebrow

    private var eyebrow: some View {
        HStack(spacing: 4) {
            Text("Settings")
            Image(systemName: "chevron.right").imageScale(.small).fontWeight(.semibold)
            Text("Wi‑Fi")
            Image(systemName: "chevron.right").imageScale(.small).fontWeight(.semibold)
            Text("Configure IPv4")
        }
        .font(.subheadline)
        .foregroundStyle(.primary)
    }

    // MARK: - Mock Content (real system components)

    private var mockContent: some View {
        VStack(spacing: 0) {
            mockNavBar

            List {
                // IP mode picker
                Section {
                    Text("Automatic")
                    manualPickerRow
                    Text(verbatim: "BootP")
                }

                // Manual IP fields — appear after selecting Manual
                if manualSelected {
                    Section("MANUAL IP") {
                        typingRow(label: "IP Address",  text: ipText,     isActive: activeField == .ip)
                        typingRow(label: "Subnet Mask", text: subnetText, isActive: activeField == .subnet)
                        HStack {
                            Text("Router")
                            Spacer()
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .listStyle(.insetGrouped)
            .scrollDisabled(true)
            .animation(.easeInOut(duration: 0.4), value: manualSelected)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .opacity(mockOpacity)
    }

    private var mockNavBar: some View {
        HStack {
            Spacer()
            saveButton
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    // MARK: - Manual Picker Row

    private var manualPickerRow: some View {
        HStack {
            Text("Manual")
            Spacer()
            ZStack {
                // Beacon shown before selection in phase 1
                StepBeacon()
                    .id(manualBeaconCycle)
                    .opacity(phase == .selectManual && !manualSelected ? 1 : 0)

                // Checkmark after selection
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color(.systemBlue))
                    .opacity(manualSelected ? 1 : 0)
                    .scaleEffect(manualSelected ? 1 : 0.4)
            }
            .animation(.spring(duration: 0.35), value: manualSelected)
            .animation(.easeInOut(duration: 0.25), value: phase)
        }
    }

    // MARK: - Typing Row

    private func typingRow(label: LocalizedStringKey, text: String, isActive: Bool) -> some View {
        HStack {
            Text(label)
            Spacer()
            HStack(spacing: 1) {
                Text(verbatim: text)
                    .font(.body.monospacedDigit())
                    .foregroundStyle(isActive ? .primary : .secondary)
                if isActive {
                    Rectangle()
                        .fill(Color(.systemBlue))
                        .frame(width: 2, height: 17)
                        .opacity(cursorVisible ? 1 : 0)
                }
            }
        }
    }

    // MARK: - Save Button with Beacon

    private var saveButton: some View {
        Button { } label: {
            Text("Save")
        }
        .guideHighlight(active: phase == .tapSave, scale: 1.3, frequency: 0.35)
    }

    // MARK: - Instruction

    private var instruction: some View {
        Group {
            switch phase {
            case .selectManual:
                Text("Select **Manual**")
            case .typeValues:
                Text("Enter your **IP Address** and **Subnet Mask** — leave Router blank")
            case .tapSave:
                Text("Tap **Save**")
            }
        }
        .font(.title3)
        .foregroundStyle(.primary)
        .animation(.easeInOut(duration: 0.3), value: phase)
    }

    // MARK: - Animations

    private func startCursorBlink() {
        withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
            cursorVisible = false
        }
    }

    private func startPhaseLoop() {
        Task { @MainActor in
            while true {
                // Fade in
                withAnimation(.easeIn(duration: 0.4)) { mockOpacity = 1.0 }

                // Phase 1 — select Manual
                manualBeaconCycle += 1
                withAnimation(.easeInOut(duration: 0.3)) { phase = .selectManual }
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                withAnimation(.spring(duration: 0.4)) { manualSelected = true }
                try? await Task.sleep(nanoseconds: 800_000_000)

                // Phase 2 — type values
                withAnimation(.easeInOut(duration: 0.3)) { phase = .typeValues }
                activeField = .ip
                for char in ipAddress {
                    ipText += String(char)
                    try? await Task.sleep(nanoseconds: 90_000_000)
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
                activeField = .subnet
                for char in subnetMask {
                    subnetText += String(char)
                    try? await Task.sleep(nanoseconds: 90_000_000)
                }
                activeField = nil
                try? await Task.sleep(nanoseconds: 700_000_000)

                // Phase 3 — tap Save
                saveBeaconCycle += 1
                withAnimation(.easeInOut(duration: 0.3)) { phase = .tapSave }
                try? await Task.sleep(nanoseconds: 2_500_000_000)

                // Fade out + reset
                withAnimation(.easeOut(duration: 0.3)) { mockOpacity = 0 }
                try? await Task.sleep(nanoseconds: 400_000_000)
                manualSelected = false
                ipText = ""
                subnetText = ""
                phase = .selectManual
            }
        }
    }
}

// MARK: - Step Beacon

private struct StepBeacon: View {
    @State private var pulse1 = false
    @State private var pulse2 = false

    var body: some View {
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
#Preview("Configure IP Step — Dark") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideConfigureIPStep(ipAddress: "192.168.1.10", subnetMask: "255.255.255.0")
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.dark)
}

#Preview("Configure IP Step — Light") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideConfigureIPStep(ipAddress: "192.168.1.10", subnetMask: "255.255.255.0")
            .padding(.horizontal, 28)
    }
    .preferredColorScheme(.light)
}
#endif
