//  SonyQRStep1GuideBlocks.swift
//  SabaiPicsStudio
//
//  UI-only components: variants for the Step 1 Sony QR guide block.
//  These are not wired into the live flow yet.
//

import SwiftUI

struct SonyQRGuideStep: Identifiable, Hashable {
    var id = UUID()
    var icon: String
    var text: String
}

// Variant A: pill rows inside a card
struct SonyQRStep1GuideBlockPills: View {
    let title: String
    let subtitle: String?
    let steps: [SonyQRGuideStep]

    init(
        title: String = "On your Sony camera",
        subtitle: String? = "Keep the camera QR screen open.",
        steps: [SonyQRGuideStep]
    ) {
        self.title = title
        self.subtitle = subtitle
        self.steps = steps
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.Theme.foreground)

                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.Theme.mutedForeground)
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(steps) { step in
                    HStack(spacing: 10) {
                        Image(systemName: step.icon)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.Theme.mutedForeground)
                            .frame(width: 18)

                        Text(step.text)
                            .font(.subheadline)
                            .foregroundStyle(Color.Theme.foreground)

                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.Theme.background))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.Theme.border, lineWidth: 1))
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color.Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.Theme.border, lineWidth: 1))
    }
}

// Variant B: timeline
struct SonyQRStep1GuideBlockTimeline: View {
    let title: String
    let subtitle: String?
    let steps: [SonyQRGuideStep]

    init(
        title: String = "Show QR on camera",
        subtitle: String? = "Follow these steps in order.",
        steps: [SonyQRGuideStep]
    ) {
        self.title = title
        self.subtitle = subtitle
        self.steps = steps
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.Theme.foreground)

                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.Theme.mutedForeground)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    let isLast = index == steps.count - 1
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .center, spacing: 12) {
                            iconCircle(icon: step.icon)

                            Text(step.text)
                                .font(.subheadline)
                                .foregroundStyle(Color.Theme.foreground)

                            Spacer(minLength: 0)
                        }

                        if !isLast {
                            connectorArrow
                        }
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func iconCircle(icon: String) -> some View {
        ZStack {
            Circle()
                .fill(Color.Theme.background)
                .overlay(Circle().stroke(Color.Theme.border, lineWidth: 1))
                .frame(width: 28, height: 28)

            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.Theme.mutedForeground)
        }
        .frame(width: 34)
    }

    private var connectorArrow: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.Theme.mutedForeground)
                .frame(width: 34)

            Spacer(minLength: 0)
        }
    }
}

// Variant C: breadcrumb sentence
struct SonyQRStep1GuideBlockBreadcrumb: View {
    let title: String
    let note: String?
    let steps: [SonyQRGuideStep]

    init(
        title: String = "Camera menu path",
        note: String? = "Ends on the screen that shows QR + SSID.",
        steps: [SonyQRGuideStep]
    ) {
        self.title = title
        self.note = note
        self.steps = steps
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.Theme.foreground)

            breadcrumb
                .font(.subheadline)
                .foregroundStyle(Color.Theme.foreground)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.Theme.background))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.Theme.border, lineWidth: 1))

            if let note {
                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(Color.Theme.mutedForeground)
                    Text(note)
                        .foregroundStyle(Color.Theme.mutedForeground)
                }
                .font(.caption)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color.Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.Theme.border, lineWidth: 1))
    }

    private var breadcrumb: Text {
        steps.enumerated().reduce(Text("")) { acc, pair in
            let (idx, step) = pair
            let chunk =
                Text(Image(systemName: step.icon))
                + Text(" ")
                + Text(step.text)

            if idx == 0 {
                return chunk
            }

            return acc
            + Text("  ")
            + Text(Image(systemName: "chevron.right"))
            + Text("  ")
            + chunk
        }
    }
}

#Preview("Sony QR Step 1 Guide Blocks") {
    let steps: [SonyQRGuideStep] = [
        .init(icon: "line.3.horizontal", text: "MENU"),
        .init(icon: "network", text: "Network"),
        .init(icon: "iphone", text: "Smartphone Control → On"),
        .init(icon: "qrcode", text: "Connection (shows QR + SSID)")
    ]

    SonyQRStep1GuideBlocksPreviewHarness(steps: steps)
}

private struct SonyQRStep1GuideBlocksPreviewHarness: View {
    enum Variant: String, CaseIterable, Identifiable {
        case pills = "Pills"
        case timeline = "Timeline"
        case breadcrumb = "Breadcrumb"

        var id: String { rawValue }
    }

    let steps: [SonyQRGuideStep]

    @State private var variant: Variant = .pills

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Variant", selection: $variant) {
                ForEach(Variant.allCases) { v in
                    Text(v.rawValue).tag(v)
                }
            }
            .pickerStyle(.segmented)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    switch variant {
                    case .pills:
                        SonyQRStep1GuideBlockPills(steps: steps)
                    case .timeline:
                        SonyQRStep1GuideBlockTimeline(steps: steps)
                    case .breadcrumb:
                        SonyQRStep1GuideBlockBreadcrumb(steps: steps)
                    }

                    Spacer(minLength: 0)
                }
                .padding(16)
            }
        }
        .padding(16)
        .background(Color.Theme.background)
    }
}
