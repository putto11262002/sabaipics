//
//  WelcomeWithClerkSheetView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-26
//
//  Branded welcome screen that opens Clerk's AuthView in a sheet.
//

import SwiftUI
import Clerk

/// Branded welcome screen with Sign In / Create Account buttons.
struct WelcomeWithClerkSheetView: View {
    @State private var showAuthSheet = false
    @State private var authMode: AuthView.Mode = .signIn
    
    /// Custom theme for Clerk AuthView matching our shadcn/ui design system
    private var clerkTheme: ClerkTheme {
        ClerkTheme(
            colors: .init(
                primary: Color.Theme.primary,
                background: Color.Theme.background,
                input: Color.Theme.input,
                danger: Color.Theme.destructive,
                success: Color(hex: "#22c55e"),  // green-500
                foreground: Color.Theme.foreground,
                mutedForeground: Color.Theme.mutedForeground,
                primaryForeground: Color.Theme.primaryForeground,
                inputForeground: Color.Theme.foreground,
                ring: Color.Theme.ring,
                muted: Color.Theme.muted,
                border: Color.Theme.border
            ),
            design: .init(
                borderRadius: 10.0  // 0.625rem = 10px
            )
        )
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Branding Section
            VStack(spacing: 16) {
                Spacer()
                    .frame(height: 60)
                
                // Logo
                Image("SabaiPicsLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 120)
                
                // App name
                Text("SabaiPics Studio")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(Color.Theme.foreground)
                
                // Tagline
                Text("Event photography made simple")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
            
            Spacer()
            
            // MARK: - Auth Buttons
            VStack(spacing: 12) {
                // Primary: Sign in
                Button("Sign in") {
                    authMode = .signIn
                    showAuthSheet = true
                }
                .buttonStyle(.primary)
                
                // Secondary: Sign up (ghost style)
                Button("Create an account") {
                    authMode = .signUp
                    showAuthSheet = true
                }
                .buttonStyle(.ghost)
                .padding(.top, 4)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            
            // MARK: - Footer
            Text("By continuing, you agree to our Terms of Service and Privacy Policy")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(Color.Theme.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
        .background(Color.Theme.background)
        .sheet(isPresented: $showAuthSheet) {
            AuthView(mode: authMode)
                .environment(\.clerkTheme, clerkTheme)
        }
    }
}

// MARK: - Color Hex Extension

private extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255
        )
    }
}

// MARK: - Preview

#Preview {
    WelcomeWithClerkSheetView()
}

#Preview("Dark Mode") {
    WelcomeWithClerkSheetView()
        .preferredColorScheme(.dark)
}
