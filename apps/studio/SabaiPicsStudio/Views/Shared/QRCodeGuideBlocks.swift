//  QRCodeGuideBlocks.swift
//  SabaiPicsStudio
//
//  UI-only components: QR code guide blocks.
//  Used to guide users to the camera screen that shows a WiFi QR.
//

import SwiftUI

struct QRCodeGuideStep: Identifiable, Hashable {
    var id = UUID()
    var icon: String
    var text: String
}

// Variant A: pill rows inside a card
struct QRCodeGuidePills: View {
    let title: String
    let subtitle: String?
    let steps: [QRCodeGuideStep]

    init(
        title: String = "On your Sony camera",
        subtitle: String? = "Keep the camera QR screen open.",
        steps: [QRCodeGuideStep]
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
struct QRCodeGuideTimeline: View {
    let title: String
    let subtitle: String?
    let steps: [QRCodeGuideStep]

    init(
        title: String = "Show QR on camera",
        subtitle: String? = "Follow these steps in order.",
        steps: [QRCodeGuideStep]
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
struct QRCodeGuideBreadcrumb: View {
    let title: String
    let note: String?
    let steps: [QRCodeGuideStep]

    init(
        title: String = "Camera menu path",
        note: String? = "Ends on the screen that shows QR + SSID.",
        steps: [QRCodeGuideStep]
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

#Preview("QR Code Guide Blocks") {
    let steps: [QRCodeGuideStep] = [
        .init(icon: "line.3.horizontal", text: "MENU"),
        .init(icon: "network", text: "Network"),
        .init(icon: "iphone", text: "Smartphone Control → On"),
        .init(icon: "qrcode", text: "Connection (shows QR + SSID)")
    ]

    QRCodeGuideBlocksPreviewHarness(steps: steps)
}

private struct QRCodeGuideBlocksPreviewHarness: View {
    enum Variant: String, CaseIterable, Identifiable {
        case pills = "Pills"
        case timeline = "Timeline"
        case breadcrumb = "Breadcrumb"

        var id: String { rawValue }
    }

    let steps: [QRCodeGuideStep]

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
                        QRCodeGuidePills(steps: steps)
                    case .timeline:
                        QRCodeGuideTimeline(steps: steps)
                    case .breadcrumb:
                        QRCodeGuideBreadcrumb(steps: steps)
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
