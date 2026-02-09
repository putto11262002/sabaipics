//
//  ButtonStyles.swift
//  FrameFast
//
//  Reusable button styles matching shadcn/ui design system.
//

import SwiftUI

// MARK: - Primary Button Style

/// Filled button with primary brand color
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Color.Theme.primaryForeground)
            .background(Color.Theme.primary)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.5)
    }
}

// MARK: - Secondary Button Style

/// Outlined button with border
struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Color.Theme.foreground)
            .background(Color.Theme.background)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(Color.Theme.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.5)
    }
}

// MARK: - Ghost Button Style

/// Text-only button (no background)
struct GhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Color.Theme.primary)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.5)
    }
}

// MARK: - Destructive Button Style

/// Red destructive action button
struct DestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
            .background(Color.Theme.destructive)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.5)
    }
}

// MARK: - Compact Button Style

/// Compact capsule-shaped button with auto-width
struct CompactButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .foregroundStyle(Color.Theme.foreground)
            .background(Color.Theme.muted)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.5)
    }
}

// MARK: - Button Style Extensions

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

extension ButtonStyle where Self == GhostButtonStyle {
    static var ghost: GhostButtonStyle { GhostButtonStyle() }
}

extension ButtonStyle where Self == DestructiveButtonStyle {
    static var destructive: DestructiveButtonStyle { DestructiveButtonStyle() }
}

extension ButtonStyle where Self == CompactButtonStyle {
    static var compact: CompactButtonStyle { CompactButtonStyle() }
}

// MARK: - Preview

#Preview("Button Styles") {
    VStack(spacing: 16) {
        Button("Primary Button") { }
            .buttonStyle(.primary)

        Button("Secondary Button") { }
            .buttonStyle(.secondary)

        Button("Ghost Button") { }
            .buttonStyle(.ghost)

        Button("Destructive Button") { }
            .buttonStyle(.destructive)

        Button("Compact Button") { }
            .buttonStyle(.compact)

        Button("Disabled Primary") { }
            .buttonStyle(.primary)
            .disabled(true)
    }
    .padding()
}
