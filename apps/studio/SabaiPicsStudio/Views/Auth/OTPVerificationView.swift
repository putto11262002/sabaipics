//
//  OTPVerificationView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//
//  OTP code verification screen for email sign-in.
//

import SwiftUI

/// Screen for entering the 6-digit OTP verification code.
struct OTPVerificationView: View {
    @ObservedObject var coordinator: AuthFlowCoordinator
    
    let email: String
    
    @State private var code: String = ""
    @State private var showResendConfirmation: Bool = false
    @FocusState private var isCodeFocused: Bool
    
    /// Check if code is valid (6 digits)
    private var isValidCode: Bool {
        code.count == 6 && code.allSatisfy { $0.isNumber }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Header with Back Button
            HStack {
                Button {
                    coordinator.goToEmailEntry()
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
                Text("Check your email")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.primary)
                
                Text("We sent a code to")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.secondary)
                
                Text(email)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
            }
            .padding(.top, 40)
            
            // MARK: - Code Input
            VStack(spacing: 16) {
                // 6-digit code field
                TextField("000000", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(size: 32, weight: .medium, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(height: 70)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.secondarySystemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(
                                isCodeFocused ? Color.accentColor : Color.clear,
                                lineWidth: 2
                            )
                    )
                    .focused($isCodeFocused)
                    .onChange(of: code) { oldValue, newValue in
                        // Limit to 6 digits
                        if newValue.count > 6 {
                            code = String(newValue.prefix(6))
                        }
                        // Filter non-numeric characters
                        code = newValue.filter { $0.isNumber }
                    }
                
                // Resend button
                Button {
                    Task {
                        await coordinator.resendOTPCode()
                        showResendConfirmation = true
                        
                        // Hide confirmation after 3 seconds
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            showResendConfirmation = false
                        }
                    }
                } label: {
                    if showResendConfirmation {
                        Label("Code sent!", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.green)
                    } else {
                        Text("Didn't receive the code? Resend")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .disabled(coordinator.isLoading || showResendConfirmation)
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            
            Spacer()
            
            // MARK: - Verify Button
            Button {
                Task {
                    let success = await coordinator.verifyOTPCode(code: code)
                    if !success {
                        // Clear code on failure so user can retry
                        code = ""
                    }
                }
            } label: {
                Group {
                    if coordinator.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Verify")
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
                .background(isValidCode ? Color.accentColor : Color.gray)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!isValidCode || coordinator.isLoading)
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .onAppear {
            // Auto-focus code field
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isCodeFocused = true
            }
        }
    }
}

// MARK: - Preview

#Preview {
    OTPVerificationView(
        coordinator: AuthFlowCoordinator(),
        email: "test@example.com"
    )
}
