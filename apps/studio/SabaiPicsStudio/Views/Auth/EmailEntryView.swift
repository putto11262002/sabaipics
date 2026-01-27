//
//  EmailEntryView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//
//  Email input screen for passwordless (OTP) authentication.
//

import SwiftUI

/// Screen for entering email address to receive OTP code.
struct EmailEntryView: View {
    @ObservedObject var coordinator: AuthFlowCoordinator
    
    @State private var email: String = ""
    @FocusState private var isEmailFocused: Bool
    
    /// Basic email validation
    private var isValidEmail: Bool {
        let emailRegex = #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Header with Back Button
            HStack {
                Button {
                    coordinator.goToWelcome()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(.primary)
                }
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            
            // MARK: - Title
            VStack(spacing: 8) {
                Text("Enter your email")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.primary)
                
                Text("We'll send you a verification code")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 40)
            
            // MARK: - Email Input
            VStack(alignment: .leading, spacing: 8) {
                TextField("Email address", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .font(.system(size: 17))
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.secondarySystemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(
                                isEmailFocused ? Color.accentColor : Color.clear,
                                lineWidth: 2
                            )
                    )
                    .focused($isEmailFocused)
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            
            Spacer()
            
            // MARK: - Continue Button
            Button {
                Task {
                    await coordinator.startEmailAuth(email: email)
                }
            } label: {
                Group {
                    if coordinator.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Continue")
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
                .background(isValidEmail ? Color.accentColor : Color.gray)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!isValidEmail || coordinator.isLoading)
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .onAppear {
            // Auto-focus email field
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isEmailFocused = true
            }
        }
    }
}

// MARK: - Preview

#Preview {
    EmailEntryView(coordinator: AuthFlowCoordinator())
}
