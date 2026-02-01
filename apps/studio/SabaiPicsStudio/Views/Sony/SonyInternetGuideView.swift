//  SonyInternetGuideView.swift
//  SabaiPicsStudio
//
//  Optional advanced guide: regain cellular internet while connected to camera WiFi.
//  Based on the PhotoSync approach (manual IP config).
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct SonyInternetGuideView: View {
    let wifiInfo: WiFiIPv4Info?
    let onSkip: () -> Void
    let onDone: () -> Void



    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Real-time upload while on camera WiFi")
                        .font(.headline)
                        .foregroundColor(Color.Theme.foreground)

                    Text("Camera WiFi usually has no internet. You can change the WiFi settings to let iOS use cellular for internet while staying connected to the camera.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    VStack(alignment: .leading, spacing: 18) {
                        timelineStep(
                            icon: "gearshape",
                            title: "Open Wi‑Fi settings",
                            body: "Open Settings → Wi‑Fi, then tap the (i) next to the camera Wi‑Fi.",
                            imageName: "SonyGuideStep1"
                        )

                        timelineStep(
                            icon: "doc.on.doc",
                            title: "Note your IP + Subnet",
                            body: "Note the IP Address and Subnet Mask shown on this screen.",
                            imageName: "SonyGuideStep2"
                        ) {
                            if let wifiInfo {
                                VStack(alignment: .leading, spacing: 8) {
                                    SonyCopyRow(label: "IP Address", value: wifiInfo.ipString)
                                    SonyCopyRow(label: "Subnet Mask", value: wifiInfo.netmaskString)
                                }
                            } else {
                                Text("IP info not available yet.")
                                    .font(.caption)
                                    .foregroundColor(Color.Theme.mutedForeground)
                            }
                        }

                        timelineStep(
                            icon: "slider.horizontal.3",
                            title: "Switch to Manual",
                            body: "Tap Configure IP → Manual, enter the same IP + Subnet, then Save.",
                            imageName: "SonyGuideStep3"
                        )
                    }
                    .overlay(alignment: .leading) {
                        timelineLine
                    }

                    Text("Optional: Transfer works without internet. Uploads can sync later when you’re back on a normal network.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                }
                .padding(20)
            }

            HStack(spacing: 12) {
                Button("Skip") { onSkip() }
                    .buttonStyle(WizardFooterCapsuleStyle(variant: .secondary))

                Button("Done") { onDone() }
                    .buttonStyle(WizardFooterCapsuleStyle(variant: .primary))
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .background(Color.Theme.background)
        }
    }
}

private let iconColumnWidth: CGFloat = 34
private let iconSize: CGFloat = 28
private let timelineContentIndent: CGFloat = 46

private func timelineStep(
    icon: String,
    title: String,
    body: String,
    imageName: String,
    @ViewBuilder extraContent: () -> some View = { EmptyView() }
) -> some View {
    VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .center, spacing: 12) {
            iconCircle(icon: icon)

            Text(title)
                .font(.headline)
                .foregroundColor(Color.Theme.foreground)

            Spacer(minLength: 0)

        }

        Text(body)
            .font(.subheadline)
            .foregroundColor(Color.Theme.mutedForeground)
            .padding(.leading, timelineContentIndent)

        extraContent()
            .padding(.leading, timelineContentIndent)

        Image(imageName)
            .resizable()
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
            .padding(.leading, timelineContentIndent)

    }
}

private func iconCircle(icon: String) -> some View {
    ZStack {
        Circle()
            .fill(Color.Theme.background)
            .overlay(Circle().stroke(Color.Theme.border, lineWidth: 1))
            .frame(width: iconSize, height: iconSize)

        Image(systemName: icon)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(Color.Theme.mutedForeground)
    }
    .frame(width: iconColumnWidth)
}

private var timelineLine: some View {
    GeometryReader { proxy in
        Rectangle()
            .fill(Color.Theme.border)
            .frame(width: 1, height: max(0, proxy.size.height - 12))
            .offset(
                x: (iconColumnWidth / 2) - 0.5,
                y: (iconSize / 2)
            )
    }
}

private struct SonyCopyRow: View {
    let label: String
    let value: String

    @State private var didCopy = false

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)

            Spacer(minLength: 0)

            Text(value)
                .font(.subheadline)
                .foregroundColor(Color.Theme.foreground)

            Button {
                #if canImport(UIKit)
                UIPasteboard.general.string = value
                #endif
                didCopy = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    didCopy = false
                }
            } label: {
                Image(systemName: didCopy ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color.Theme.mutedForeground)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct WizardFooterCapsuleStyle: ButtonStyle {
    enum Variant {
        case primary
        case secondary
    }

    let variant: Variant

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(variant == .primary ? Color.Theme.primaryForeground : Color.Theme.foreground)
            .background(
                Group {
                    if variant == .primary {
                        Capsule().fill(Color.Theme.foreground)
                    } else {
                        Capsule().fill(Color.Theme.background)
                    }
                }
            )
            .overlay(
                Group {
                    if variant == .secondary {
                        Capsule().stroke(Color.Theme.border, lineWidth: 1)
                    }
                }
            )
            .opacity(configuration.isPressed ? 0.9 : 1.0)
    }
}


#if DEBUG
#Preview("Sony Internet Guide") {
    NavigationView {
        SonyInternetGuideView(
            wifiInfo: WiFiIPv4Info(ip: 0xC0A8010A, netmask: 0xFFFFFF00),
            onSkip: {},
            onDone: {}
        )
    }
}
#endif
