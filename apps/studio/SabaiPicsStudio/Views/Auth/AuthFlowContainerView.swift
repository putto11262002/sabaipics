//
//  AuthFlowContainerView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//
//  State-driven container that renders the appropriate auth view based on AuthFlowState.
//

import SwiftUI

/// Container view that manages navigation through the custom auth flow.
///
/// This view reads from `AuthFlowCoordinator.state` and renders the appropriate
/// child view (Welcome, EmailEntry, OTPVerification, etc.)
struct AuthFlowContainerView: View {
    @StateObject private var coordinator = AuthFlowCoordinator()
    
    var body: some View {
        ZStack {
            // Background
            Color(.systemBackground)
                .ignoresSafeArea()
            
            // Content based on state
            Group {
                switch coordinator.state {
                case .welcome:
                    WelcomeView(coordinator: coordinator)
                    
                case .emailEntry:
                    EmailEntryView(coordinator: coordinator)
                    
                case .otpPending(let email):
                    OTPVerificationView(
                        coordinator: coordinator,
                        email: email
                    )
                    
                case .error(let message, let canRetry):
                    AuthErrorView(
                        message: message,
                        canRetry: canRetry,
                        onRetry: { coordinator.goToWelcome() }
                    )
                    
                case .accountNotFound(let email, let signUpURL):
                    AccountNotFoundView(
                        email: email,
                        signUpURL: signUpURL,
                        onBack: { coordinator.goToWelcome() }
                    )
                }
            }
            .animation(.easeInOut(duration: 0.2), value: coordinator.state)
        }
    }
}

// MARK: - Error View

/// Error view with retry option
struct AuthErrorView: View {
    let message: String
    let canRetry: Bool
    let onRetry: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
            
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            
            if canRetry {
                Button("Try Again") {
                    onRetry()
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

// MARK: - Account Not Found View

/// View shown when user's account doesn't exist - directs to web sign-up
struct AccountNotFoundView: View {
    let email: String
    let signUpURL: URL
    let onBack: () -> Void
    
    @Environment(\.openURL) private var openURL
    
    var body: some View {
        VStack(spacing: 0) {
            // Header with back button
            HStack {
                Button {
                    onBack()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(.primary)
                }
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            
            Spacer()
            
            // Content
            VStack(spacing: 24) {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .font(.system(size: 64))
                    .foregroundStyle(.secondary)
                
                VStack(spacing: 8) {
                    Text("Account not found")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.primary)
                    
                    if !email.isEmpty {
                        Text("No account exists for")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(.secondary)
                        
                        Text(email)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.primary)
                    } else {
                        Text("Please sign up first to use this app.")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                }
                
                // Sign up button
                Button {
                    openURL(signUpURL)
                } label: {
                    Label("Sign up at SabaiPics", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .background(Color.accentColor)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                
                Text("After signing up, come back here to sign in.")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            
            Spacer()
            
            // Try different email button
            Button {
                onBack()
            } label: {
                Text("Try a different email")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.accentColor)
            }
            .padding(.bottom, 32)
        }
    }
}

// MARK: - Preview

#Preview {
    AuthFlowContainerView()
}

#Preview("Account Not Found") {
    AccountNotFoundView(
        email: "test@example.com",
        signUpURL: URL(string: "https://sabaipics.com/sign-up")!,
        onBack: {}
    )
}
