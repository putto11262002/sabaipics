//
//  GuideHighlightModifier.swift
//  FrameFast
//
//  Reusable pulsing scale effect for the connectivity guide.
//  Attach to any view to make it "breathe" when active.
//  Uses a Task loop instead of .repeatForever so the animation
//  cancels cleanly when active flips to false.
//

import SwiftUI

struct GuideHighlightModifier: ViewModifier {
    let active: Bool
    let scale: CGFloat
    let frequency: Double

    @State private var scaled = false
    @State private var pulseTask: Task<Void, Never>?

    func body(content: Content) -> some View {
        content
            .scaleEffect(scaled ? scale : 1.0)
            .animation(.easeInOut(duration: frequency), value: scaled)
            .onChange(of: active) { _, isActive in
                pulseTask?.cancel()
                if isActive {
                    startPulsing()
                } else {
                    scaled = false
                }
            }
            .onAppear {
                if active { startPulsing() }
            }
            .onDisappear {
                pulseTask?.cancel()
            }
    }

    private func startPulsing() {
        pulseTask = Task { @MainActor in
            while !Task.isCancelled {
                scaled = true
                try? await Task.sleep(nanoseconds: UInt64(frequency * 1_000_000_000))
                guard !Task.isCancelled else { break }
                scaled = false
                try? await Task.sleep(nanoseconds: UInt64(frequency * 1_000_000_000))
            }
            scaled = false
        }
    }
}

extension View {
    /// Pulses the view's scale when `active` is true.
    /// - Parameters:
    ///   - active: Whether the highlight is currently on.
    ///   - scale: Max scale factor (e.g. 1.15 for subtle, 1.3 for prominent).
    ///   - frequency: Duration of one pulse cycle in seconds (lower = faster).
    func guideHighlight(active: Bool, scale: CGFloat = 1.15, frequency: Double = 0.35) -> some View {
        modifier(GuideHighlightModifier(active: active, scale: scale, frequency: frequency))
    }
}
