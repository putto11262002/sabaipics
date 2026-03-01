//  CameraWiFiJoinScene.swift
//  FrameFast
//
//  Mock iOS WiFi settings list with a pulsing beacon on the camera network row.
//  Shared across Canon, Nikon, and Sony setup views.

import SwiftUI

struct CameraWiFiJoinScene: View {
    let ssid: String

    @State private var pulse1 = false
    @State private var pulse2 = false

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    Toggle("Wi‑Fi", isOn: .constant(true))
                }

                Section {
                    HStack(spacing: 10) {
                        Text(ssid)

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
        .onAppear { startPulse() }
    }

    // MARK: - Tap Beacon

    private var tapBeacon: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemBlue).opacity(0.5), lineWidth: 1.5)
                .frame(width: 22, height: 22)
                .scaleEffect(pulse1 ? 2.2 : 1.0)
                .opacity(pulse1 ? 0 : 1)

            Circle()
                .stroke(Color(.systemBlue).opacity(0.35), lineWidth: 1.5)
                .frame(width: 22, height: 22)
                .scaleEffect(pulse2 ? 2.2 : 1.0)
                .opacity(pulse2 ? 0 : 1)

            Circle()
                .fill(Color(.systemBlue).opacity(0.12))
                .frame(width: 22, height: 22)
        }
    }

    // MARK: - Animation

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

#Preview("Camera WiFi Join — Canon") {
    CameraWiFiJoinScene(ssid: "Canon camera Wi‑Fi")
        .padding(.horizontal, 28)
}

#Preview("Camera WiFi Join — Nikon") {
    CameraWiFiJoinScene(ssid: "Nikon camera Wi‑Fi")
        .padding(.horizontal, 28)
}

#Preview("Camera WiFi Join — Sony") {
    CameraWiFiJoinScene(ssid: "Sony camera Wi‑Fi")
        .padding(.horizontal, 28)
}

#endif
