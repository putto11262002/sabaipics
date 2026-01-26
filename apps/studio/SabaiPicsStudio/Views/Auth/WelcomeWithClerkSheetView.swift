//
//  WelcomeWithClerkSheetView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-26
//
//  Experimental: Branded welcome screen that opens Clerk's AuthView in a sheet.
//

import SwiftUI
import Clerk

/// Branded welcome screen with a single Sign In button that opens Clerk's AuthView in a sheet.
struct WelcomeWithClerkSheetView: View {
    @State private var showAuthSheet = false
    @State private var authMode: AuthView.Mode = .signIn
    
    /// Custom theme to match SabaiPics app styling
    private let sabaiTheme = ClerkTheme(
        colors: .init(
            primary: Color.accentColor,           // Use app's accent color
            background: Color(.systemBackground), // Match system background
            input: Color(.secondarySystemBackground),
            ring: .clear,                         // Remove focus ring
        ),
        design: .init(
            borderRadius: 12.0                    // Match app's corner radius
        )
    )
    
    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Branding Section
            VStack(spacing: 16) {
                Spacer()
                    .frame(height: 60)
                
                // Logo placeholder
                Image(systemName: "camera.fill")
                    .font(.system(size: 72, weight: .medium))
                    .foregroundStyle(.primary)
                
                // App name
                Text("SabaiPics Studio")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.primary)
                
                // Tagline
                Text("Event photography made simple")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            // MARK: - Auth Buttons
            VStack(spacing: 12) {
                // Primary: Sign in button (filled)
                Button {
                    authMode = .signIn
                    showAuthSheet = true
                } label: {
                    Text("Sign in")
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .background(Color.accentColor)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                
                // Secondary: Sign up button (text only)
                Button {
                    authMode = .signUp
                    showAuthSheet = true
                } label: {
                    Text("Create an account")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.accentColor)
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            
            // MARK: - Footer
            Text("By continuing, you agree to our Terms of Service and Privacy Policy")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
        .sheet(isPresented: $showAuthSheet) {
            AuthView(mode: authMode)
                .environment(\.clerkTheme, sabaiTheme)
        }
    }
}

// MARK: - Preview

#Preview {
    WelcomeWithClerkSheetView()
}
