//
//  CameraWiFiInternetGuideView.swift
//  FrameFast
//
//  Lightweight guide UI: keep cellular internet while connected to camera Wi‑Fi.
//  Isolated view for iterating on UI/UX (integration happens elsewhere).
//

import SwiftUI

struct CameraWiFiInternetGuideView: View {
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    let onSkip: () -> Void
    let onContinue: () -> Void

    @State private var currentStepIndex: Int = 0
    @State private var showOfflineContinueAlert: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 20)

            stepContent
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            footerButtons
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 12)
                .background(Color.Theme.background)
        }
        .background(Color.Theme.background.ignoresSafeArea())
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Keep internet while connected")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.Theme.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct Step: Identifiable {
        enum Part: Equatable {
            case text(String)
            case icon(systemName: String)
        }

        let id: Int
        let parts: [Part]
        let imageName: String
    }

    private var steps: [Step] {
        [
            Step(
                id: 0,
                parts: [
                    .text("1. Open Settings"),
                    .text("Wi‑Fi"),
                    .text("Select camera network"),
                    .text("Tap"),
                    .icon(systemName: "info.circle")
                ],
                imageName: "ConnectivityGuideWiFi"
            ),
            Step(
                id: 1,
                parts: [
                    .text("2. Scroll to IPV4 Address"),
                    .text("Note IP Address + Subnet Mask"),
                    .text("Configure IP")
                ],
                imageName: "ConnectivityGuideDetails"
            ),
            Step(
                id: 2,
                parts: [
                    .text("3. Configure IP"),
                    .text("Manual"),
                    .text("Enter IP Address + Subnet Mask"),
                    .text("Leave Router blank"),
                    .text("Save")
                ],
                imageName: "ConnectivityGuideManual"
            ),
            Step(
                id: 3,
                parts: [
                    .text("4. Return to FrameFast"),
                    .text("Continue")
                ],
                imageName: "ConnectivityGuideDone"
            )
        ]
    }

    private var stepContent: some View {
        let step = steps[min(max(currentStepIndex, 0), steps.count - 1)]
        let imageShape = RoundedRectangle(cornerRadius: 20, style: .continuous)

        return VStack(alignment: .leading, spacing: 12) {
            stepLine(step.parts)
                .font(.footnote)
                .foregroundStyle(Color.Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)

            Image(step.imageName)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .clipShape(imageShape)
                .background {
                    imageShape
                        .fill(Color.Theme.card.opacity(0.001))
                        .shadow(color: Color.black.opacity(0.14), radius: 16, x: 0, y: 10)
                }
        }
    }

    private func stepLine(_ parts: [Step.Part]) -> Text {
        guard let first = parts.first else { return Text("") }

        func text(for part: Step.Part) -> Text {
            switch part {
            case .text(let value):
                return Text(value)
            case .icon(let systemName):
                return Text(Image(systemName: systemName))
            }
        }

        var t = text(for: first)
        for part in parts.dropFirst() {
            t =
                t
                + Text("  ")
                + Text(Image(systemName: "chevron.right"))
                + Text("  ")
                + text(for: part)
        }
        return t
    }

    private var footerButtons: some View {
        HStack(spacing: 12) {
            if currentStepIndex == 0 {
                Button("Skip") {
                    onSkip()
                }
                .buttonStyle(.secondary)
            } else {
                Button {
                    goToPreviousStep()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                }
                .buttonStyle(.secondary)
            }

            Spacer(minLength: 0)

            if currentStepIndex < (steps.count - 1) {
                Button {
                    goToNextStep()
                } label: {
                    HStack(spacing: 8) {
                        Text("Next")
                        Image(systemName: "chevron.right")
                    }
                }
                .buttonStyle(.primary)
            } else {
                Button("Continue") {
                    if connectivityStore.isOnline {
                        onContinue()
                    } else {
                        showOfflineContinueAlert = true
                    }
                }
                .buttonStyle(.primary)
                .alert("Internet still unavailable", isPresented: $showOfflineContinueAlert) {
                    Button("Go back", role: .cancel) {}
                    Button("Continue anyway") {
                        onContinue()
                    }
                } message: {
                    Text("You can still scan and transfer photos. Real‑time uploads can resume later when you’re back online.")
                }
            }
        }
    }

    private func goToNextStep() {
        guard currentStepIndex < (steps.count - 1) else { return }
        withAnimation(.snappy) {
            currentStepIndex += 1
        }
    }

    private func goToPreviousStep() {
        guard currentStepIndex > 0 else { return }
        withAnimation(.snappy) {
            currentStepIndex -= 1
        }
    }
}

#if DEBUG

#Preview("Camera Wi‑Fi Internet Guide") {
    CameraWiFiInternetGuideView(onSkip: {}, onContinue: {})
}

#endif
