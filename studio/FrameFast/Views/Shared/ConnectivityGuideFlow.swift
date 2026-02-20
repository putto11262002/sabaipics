//
//  ConnectivityGuideFlow.swift
//  FrameFast
//
//  Container that auto-plays through connectivity guide steps with slide
//  transitions. Connectivity is monitored in the background — when isOnline
//  becomes true, the flow jumps directly to the success step from wherever it is.
//
//  Nav buttons are hidden during auto-play and appear only if the user is
//  still on the Configure IP step waiting for a connection (autoPlayDone).
//

import SwiftUI

struct ConnectivityGuideFlow: View {
    let isOnline: Bool
    let ipAddress: String
    let subnetMask: String
    let onSkip: () -> Void
    let onDone: () -> Void

    // Durations synced to each step's animation cycle.
    // Auto-advance covers steps 0→1→2 only (currentStep < stepCount - 2).
    // Step 3 (success) is reached only when isOnline becomes true, never by timer.
    private let stepCount = 4
    private let stepDurations: [Double] = [3, 6.3, 8.5, 3600]

    @State private var currentStep = 0
    @State private var goingForward = true
    @State private var advanceTask: Task<Void, Never>?
    @State private var hidePrevButton = false
    // Set when user manually taps < or > — disables auto-advance.
    @State private var userNavigated = false
    // Set when step 2's timer fires with no connection yet — reveals nav buttons
    // so the user can go back and retry configuration.
    @State private var autoPlayDone = false

    var body: some View {
        VStack(spacing: 0) {
            stepContent
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(.horizontal, 28)

            bottomBar
                .padding(.horizontal, 28)
                .padding(.top, 20)
                .padding(.bottom, 24)
        }
        .onAppear {
            if isOnline {
                jumpToSuccess()
            } else {
                scheduleAdvance()
            }
        }
        .onDisappear { advanceTask?.cancel() }
        .onChange(of: isOnline) { _, online in
            guard online, currentStep < stepCount - 1 else { return }
            jumpToSuccess()
        }
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch currentStep {
        case 0:
            ConnectivityGuideWiFiTapStep()
                .id(0)
                .transition(stepTransition)
        case 1:
            ConnectivityGuideIPv4Step(ipAddress: ipAddress, subnetMask: subnetMask)
                .id(1)
                .transition(stepTransition)
        case 2:
            ConnectivityGuideConfigureIPStep(ipAddress: ipAddress, subnetMask: subnetMask)
                .id(2)
                .transition(stepTransition)
        case 3:
            ConnectivityGuideOnlineCheckStep(
                onSuccess: { hidePrevButton = true },
                onDone: { onDone() }
            )
            .id(3)
            .transition(stepTransition)
        default:
            EmptyView()
        }
    }

    private var stepTransition: AnyTransition {
        .asymmetric(
            insertion: .move(edge: goingForward ? .trailing : .leading).combined(with: .opacity),
            removal:   .move(edge: goingForward ? .leading : .trailing).combined(with: .opacity)
        )
    }

    // MARK: - Bottom Bar

    private var showNav: Bool { autoPlayDone || userNavigated }

    private var bottomBar: some View {
        HStack(spacing: 0) {
            navButton(systemName: "chevron.left", action: { navigate(by: -1) })
                .opacity(showNav && !hidePrevButton && currentStep > 0 ? 1 : 0)
                .disabled(!showNav || hidePrevButton || currentStep == 0)

            Spacer()

            stepDots

            Spacer()

            if currentStep == stepCount - 2 {
                ProgressView()
                    .tint(Color.primary.opacity(0.5))
                    .frame(width: 40, height: 40)
            } else {
                navButton(systemName: "chevron.right", action: { navigate(by: 1) })
                    .opacity(showNav && currentStep < stepCount - 2 ? 1 : 0)
                    .disabled(!showNav || currentStep >= stepCount - 2)
            }
        }
    }

    private var stepDots: some View {
        HStack(spacing: 7) {
            ForEach(0..<stepCount, id: \.self) { index in
                Circle()
                    .fill(index == currentStep
                          ? Color.primary
                          : Color.primary.opacity(0.2))
                    .frame(width: 6, height: 6)
                    .animation(.easeInOut(duration: 0.3), value: currentStep)
            }
        }
    }

    private func navButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .stroke(Color.primary.opacity(0.25), lineWidth: 1.5)
                    .frame(width: 40, height: 40)
                Image(systemName: systemName)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.primary)
            }
        }
    }

    // MARK: - Navigation

    private func jumpToSuccess() {
        advanceTask?.cancel()
        goingForward = true
        withAnimation(.easeInOut(duration: 0.6)) { currentStep = stepCount - 1 }
    }

    private func navigate(by delta: Int) {
        let next = min(max(currentStep + delta, 0), stepCount - 1)
        guard next != currentStep else { return }
        advanceTask?.cancel()
        userNavigated = true
        goingForward = delta > 0
        hidePrevButton = false
        withAnimation(.easeInOut(duration: 0.6)) {
            currentStep = next
        }
    }

    private func scheduleAdvance() {
        guard !userNavigated else { return }
        advanceTask?.cancel()
        let duration = stepDurations[min(currentStep, stepDurations.count - 1)]
        advanceTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            guard !Task.isCancelled, !userNavigated else { return }
            if currentStep < stepCount - 2 {
                // Advance through instruction steps 0 → 1 → 2
                goingForward = true
                withAnimation(.easeInOut(duration: 0.6)) { currentStep += 1 }
                scheduleAdvance()
            } else {
                // Auto-play finished at Configure IP. Reveal nav in case
                // user is stuck waiting for connection and needs to retry.
                withAnimation(.easeInOut(duration: 0.3)) { autoPlayDone = true }
            }
        }
    }
}

#if DEBUG
#Preview("Connectivity Guide Flow — Dark (offline)") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideFlow(isOnline: false, ipAddress: "192.168.1.10", subnetMask: "255.255.255.0", onSkip: {}, onDone: {})
    }
    .preferredColorScheme(.dark)
}

#Preview("Connectivity Guide Flow — Light (offline)") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideFlow(isOnline: false, ipAddress: "192.168.1.10", subnetMask: "255.255.255.0", onSkip: {}, onDone: {})
    }
    .preferredColorScheme(.light)
}

#Preview("Connectivity Guide Flow — Dark (online)") {
    ZStack {
        Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
        ConnectivityGuideFlow(isOnline: true, ipAddress: "192.168.1.10", subnetMask: "255.255.255.0", onSkip: {}, onDone: {})
    }
    .preferredColorScheme(.dark)
}

#Preview("Guide in Sheet — Dark (offline)") {
    NavigationStack {
        ZStack {
            Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
            ConnectivityGuideFlow(isOnline: false, ipAddress: "192.168.1.10", subnetMask: "255.255.255.0", onSkip: {}, onDone: {})
        }
        .navigationTitle("Connect camera")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { } label: {
                    Image(systemName: "chevron.left")
                        .fontWeight(.semibold)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                }
            }
        }
    }
    .preferredColorScheme(.dark)
}

#Preview("Guide in Sheet — Light (offline)") {
    NavigationStack {
        ZStack {
            Color(uiColor: UIColor.systemGroupedBackground).ignoresSafeArea()
            ConnectivityGuideFlow(isOnline: false, ipAddress: "192.168.1.10", subnetMask: "255.255.255.0", onSkip: {}, onDone: {})
        }
        .navigationTitle("Connect camera")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { } label: {
                    Image(systemName: "chevron.left")
                        .fontWeight(.semibold)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                }
            }
        }
    }
    .preferredColorScheme(.light)
}
#endif
