//
//  WelcomeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//
//  Branded welcome/entry screen with auth provider buttons.
//

import SwiftUI

/// Branded welcome screen with authentication provider buttons.
///
/// Shows SabaiPics branding and offers:
/// - Continue with Email (goes to EmailEntryView)
/// - Continue with Google (starts OAuth)
/// - Continue with LINE (starts OAuth)
struct WelcomeView: View {
    @ObservedObject var coordinator: AuthFlowCoordinator
    
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
                    .foregroundStyle(.primary)
                
                // Tagline
                Text("Event photography made simple")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            // MARK: - Provider Buttons
            VStack(spacing: 12) {
                // Email button (outlined)
                Button {
                    coordinator.goToEmailEntry()
                } label: {
                    Label("Continue with Email", systemImage: "envelope.fill")
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.primary)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Color.gray.opacity(0.3), lineWidth: 1)
                        )
                }
                
                // Google button (official asset: "Sign in with Google")
                Button {
                    Task {
                        await coordinator.startOAuth(provider: SocialProvider.google)
                    }
                } label: {
                    EmptyView()
                }
                .buttonStyle(
                    GoogleSignInButtonStyle(
                        isLoading: coordinator.oauthLoadingProvider == .google
                    )
                )
                .accessibilityLabel("Continue with Google")
                
                // LINE button (official asset: "Log in with LINE")
                Button {
                    Task {
                        await coordinator.startOAuth(provider: SocialProvider.line)
                    }
                } label: {
                    EmptyView()
                }
                .buttonStyle(
                    LineLoginButtonStyle(
                        isLoading: coordinator.oauthLoadingProvider == .line
                    )
                )
                .accessibilityLabel("Log in with LINE")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .disabled(coordinator.isLoading)
            .opacity(coordinator.isLoading ? 0.6 : 1.0)
            
            // MARK: - Footer
            Text("By continuing, you agree to our Terms of Service and Privacy Policy")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
    }
}

private struct ProviderImageButtonStyle: ButtonStyle {
    let normalAssetName: String
    let pressedAssetName: String?
    let height: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        let assetName = (configuration.isPressed ? pressedAssetName : nil) ?? normalAssetName

        Image(assetName)
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.95 : 1.0)
    }
}

private struct GoogleSignInButtonStyle: ButtonStyle {
    let isLoading: Bool

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            HStack(spacing: 12) {
                Image("GoogleGMark")
                    .renderingMode(.original)
                    .resizable()
                    .frame(width: 20, height: 20)

                Text("Continue with Google")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
            }

            if isLoading {
                HStack {
                    Spacer(minLength: 0)
                    ProgressView()
                        .controlSize(.regular)
                }
                .padding(.trailing, 2)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.gray.opacity(0.3), lineWidth: 1)
        )
        .opacity(configuration.isPressed ? 0.95 : 1.0)
        .contentShape(Rectangle())
    }
}

private struct LineLoginButtonStyle: ButtonStyle {
    let isLoading: Bool

    // LINE brand colors (from official button guidelines)
    private let baseGreen = Color(red: 6 / 255, green: 199 / 255, blue: 85 / 255) // #06C755

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            HStack(spacing: 12) {
                Image("LineIcon")
                    .renderingMode(.original)
                    .resizable()
                    .frame(width: 20, height: 20)

                Rectangle()
                    .fill(Color.black.opacity(0.08))
                    .frame(width: 1, height: 22)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text("Log in with LINE")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)

            if isLoading {
                HStack {
                    Spacer(minLength: 0)
                    ProgressView()
                        .tint(.white)
                        .controlSize(.regular)
                }
                .padding(.trailing, 2)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(baseGreen)
        )
        .overlay {
            if configuration.isPressed {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.black.opacity(0.30))
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Preview

#Preview {
    WelcomeView(coordinator: AuthFlowCoordinator())
}
