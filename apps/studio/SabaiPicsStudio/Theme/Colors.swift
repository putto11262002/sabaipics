//
//  Colors.swift
//  SabaiPicsStudio
//
//  Design system colors matching web shadcn/ui theme.
//  Auto-adapts to light/dark mode via Asset Catalog.
//

import SwiftUI

// MARK: - Theme Colors

extension Color {
    /// Theme namespace for design system colors (matching shadcn/ui)
    enum Theme {
        // MARK: - Backgrounds

        /// Main background color (white in light mode, dark gray in dark mode)
        static let background = Color("ThemeBackground")
        
        /// Card background
        static let card = Color("ThemeCard")
        
        /// Secondary/muted background
        static let muted = Color("ThemeMuted")
        
        /// Accent background
        static let accent = Color("ThemeAccent")
        
        /// Input field background
        static let input = Color("ThemeInput")
        
        // MARK: - Foregrounds (Text)
        
        /// Primary text color
        static let foreground = Color("ThemeForeground")
        
        /// Card text color
        static let cardForeground = Color("ThemeCardForeground")
        
        /// Secondary/muted text color
        static let mutedForeground = Color("ThemeMutedForeground")
        
        /// Accent text color
        static let accentForeground = Color("ThemeAccentForeground")
        
        // MARK: - Brand

        /// Primary color (neutral dark gray in light mode, light gray in dark mode)
        static let primary = Color("ThemePrimary")

        /// Text on primary background
        static let primaryForeground = Color("ThemePrimaryForeground")
        
        // MARK: - Secondary
        
        /// Secondary color
        static let secondary = Color("ThemeSecondary")
        
        /// Text on secondary background
        static let secondaryForeground = Color("ThemeSecondaryForeground")
        
        // MARK: - Semantic
        
        /// Destructive/error color (red)
        static let destructive = Color("ThemeDestructive")
        
        /// Text on destructive background
        static let destructiveForeground = Color("ThemeDestructiveForeground")

        /// Success color (green)
        static let success = Color("ThemeSuccess")

        /// Text on success background
        static let successForeground = Color("ThemeSuccessForeground")

        /// Warning color (amber)
        static let warning = Color("ThemeWarning")

        /// Text on warning background
        static let warningForeground = Color("ThemeWarningForeground")

        /// Info color (blue)
        static let info = Color("ThemeInfo")

        /// Text on info background
        static let infoForeground = Color("ThemeInfoForeground")
        
        /// Border color
        static let border = Color("ThemeBorder")
        
        /// Focus ring color
        static let ring = Color("ThemeRing")
    }
}

// MARK: - Preview Helper

#Preview("Color Palette") {
    ScrollView {
        VStack(alignment: .leading, spacing: 12) {
            Text("Backgrounds").font(.headline)
            Group {
                ColorRow(name: "background", color: .Theme.background)
                ColorRow(name: "card", color: .Theme.card)
                ColorRow(name: "muted", color: .Theme.muted)
                ColorRow(name: "accent", color: .Theme.accent)
                ColorRow(name: "input", color: .Theme.input)
            }
            
            Divider().padding(.vertical, 8)
            
            Text("Foregrounds").font(.headline)
            Group {
                ColorRow(name: "foreground", color: .Theme.foreground)
                ColorRow(name: "cardForeground", color: .Theme.cardForeground)
                ColorRow(name: "mutedForeground", color: .Theme.mutedForeground)
                ColorRow(name: "accentForeground", color: .Theme.accentForeground)
            }
            
            Divider().padding(.vertical, 8)
            
            Text("Brand").font(.headline)
            Group {
                ColorRow(name: "primary", color: .Theme.primary)
                ColorRow(name: "primaryForeground", color: .Theme.primaryForeground)
                ColorRow(name: "secondary", color: .Theme.secondary)
                ColorRow(name: "secondaryForeground", color: .Theme.secondaryForeground)
            }
            
            Divider().padding(.vertical, 8)
            
            Text("Semantic").font(.headline)
            Group {
                ColorRow(name: "destructive", color: .Theme.destructive)
                ColorRow(name: "destructiveForeground", color: .Theme.destructiveForeground)
                ColorRow(name: "border", color: .Theme.border)
                ColorRow(name: "ring", color: .Theme.ring)
            }
        }
        .padding()
    }
}

private struct ColorRow: View {
    let name: String
    let color: Color
    
    var body: some View {
        HStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(color)
                .frame(width: 50, height: 32)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(Color.Theme.border, lineWidth: 1)
                )
            Text(name)
                .font(.system(.footnote, design: .monospaced))
            Spacer()
        }
    }
}
