//
//  AuthFlowCoordinator.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//
//  Manages custom auth flow state and Clerk API interactions.
//  Sign-in only - users must sign up on the web app.
//
//  API Reference: https://clerk.github.io/clerk-ios/documentation/clerk/
//

import Foundation
import SwiftUI
import Clerk

/// Coordinator that manages the custom authentication flow (sign-in only).
///
/// Usage:
/// ```swift
/// @StateObject private var coordinator = AuthFlowCoordinator()
/// ```
@MainActor
final class AuthFlowCoordinator: ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var state: AuthFlowState = .welcome
    @Published private(set) var isLoading: Bool = false

    /// Which OAuth provider is currently being launched (used to show a loading
    /// indicator on the tapped provider button).
    @Published private(set) var oauthLoadingProvider: SocialProvider? = nil
    
    /// The email address being used for the current auth attempt
    @Published private(set) var currentEmail: String = ""
    
    // MARK: - Configuration
    
    /// Sign-up URL read from Info.plist (injected via xcconfig)
    private let signUpURL: URL
    
    // MARK: - Init
    
    init() {
        // Read sign-up URL from Bundle (injected via Info.plist)
        if let urlString = Bundle.main.object(forInfoDictionaryKey: "SignUpURL") as? String,
           let url = URL(string: urlString) {
            self.signUpURL = url
        } else {
            // Fallback if not configured
            self.signUpURL = URL(string: "https://sabaipics.com/sign-up")!
        }
    }
    
    // MARK: - Navigation
    
    /// Reset to welcome screen
    func goToWelcome() {
        state = .welcome
        currentEmail = ""
    }
    
    /// Navigate to email entry
    func goToEmailEntry() {
        state = .emailEntry
    }
    
    // MARK: - Email OTP Flow
    
    /// Start sign-in with email. If user doesn't exist, shows sign-up link.
    ///
    /// Per Clerk docs:
    /// 1. Create SignIn with identifier
    /// 2. Prepare email_code first factor (sends OTP)
    /// 3. If user doesn't exist (form_identifier_not_found), show sign-up link
    ///
    /// - Parameter email: User's email address
    func startEmailAuth(email: String) async {
        guard !email.isEmpty else { return }
        
        isLoading = true
        currentEmail = email
        
        do {
            // Step 1: Create sign-in with identifier
            let signIn = try await SignIn.create(strategy: .identifier(email))
            
            // Step 2: Prepare email code factor (sends OTP)
            try await signIn.prepareFirstFactor(strategy: .emailCode())
            
            // Success - move to OTP pending state
            state = .otpPending(email: email)
            
        } catch let error as ClerkAPIError {
            if error.code == "form_identifier_not_found" {
                // User doesn't exist - show sign-up link (no sign-up in this app)
                state = .accountNotFound(email: email, signUpURL: signUpURL)
            } else {
                handleClerkError(error)
            }
        } catch {
            handleGenericError(error)
        }
        
        isLoading = false
    }
    
    /// Verify OTP code for email sign-in.
    ///
    /// Per Clerk docs:
    /// - Use `signIn.attemptFirstFactor(strategy: .emailCode(code:))`
    ///
    /// - Parameter code: 6-digit OTP code
    /// - Returns: true if verification succeeded
    func verifyOTPCode(code: String) async -> Bool {
        guard code.count == 6 else { return false }
        
        isLoading = true
        
        do {
            guard let signIn = Clerk.shared.client?.signIn else {
                state = .error(message: "Sign-in session expired. Please try again.", canRetry: true)
                isLoading = false
                return false
            }
            
            let result = try await signIn.attemptFirstFactor(
                strategy: .emailCode(code: code)
            )
            
            if result.status == .complete {
                // SUCCESS - session is automatically active
                isLoading = false
                return true
            } else {
                state = .error(message: "Sign-in incomplete. Please try again.", canRetry: true)
            }
            
        } catch let error as ClerkAPIError {
            handleClerkError(error)
        } catch {
            handleGenericError(error)
        }
        
        isLoading = false
        return false
    }
    
    /// Resend OTP code to email.
    ///
    /// Per Clerk docs:
    /// - `signIn.prepareFirstFactor(strategy: .emailCode())`
    func resendOTPCode() async {
        isLoading = true
        
        do {
            guard let signIn = Clerk.shared.client?.signIn else {
                state = .error(message: "Sign-in session expired. Please try again.", canRetry: true)
                isLoading = false
                return
            }
            try await signIn.prepareFirstFactor(strategy: .emailCode())
        } catch let error as ClerkAPIError {
            handleClerkError(error)
        } catch {
            handleGenericError(error)
        }
        
        isLoading = false
    }
    
    // MARK: - OAuth Flow
    
    /// Start OAuth authentication with the specified provider.
    ///
    /// Per Clerk docs:
    /// - Use `SignIn.authenticateWithRedirect(strategy: .oauth(provider:))`
    /// - Result is `TransferFlowResult` which is either `.signIn` or `.signUp`
    /// - If `.signUp` is returned, user doesn't have an account
    ///
    /// Note: Requires Associated Domains configured in Xcode for redirect to work.
    ///
    /// - Parameter provider: Social provider (Google or LINE)
    func startOAuth(provider: SocialProvider) async {
        isLoading = true
        oauthLoadingProvider = provider
        state = .welcome
        
        do {
            // Map our local SocialProvider enum to Clerk's OAuthProvider
            let clerkProvider: OAuthProvider
            switch provider {
            case .google:
                clerkProvider = .google
            case .line:
                clerkProvider = .line
            }
            
            // This handles the full OAuth redirect flow
            let result = try await SignIn.authenticateWithRedirect(
                strategy: .oauth(provider: clerkProvider)
            )
            
            switch result {
            case .signIn(let signIn):
                // Existing user
                if signIn.status == .complete {
                    // SUCCESS - session is automatically active
                    // RootFlowView will detect clerk.user != nil and show MainTabView
                } else {
                    // Return to welcome (avoid trapping the user on an error screen)
                    state = .welcome
                }
                
            case .signUp:
                // New user - they need to sign up on web first
                // OAuth transferred to sign-up means account doesn't exist
                state = .accountNotFound(email: "", signUpURL: signUpURL)
            }
            
        } catch let error as ClerkAPIError {
            // Common case: user cancels the OAuth prompt. Avoid showing an error screen.
            state = .welcome
        } catch {
            state = .welcome
        }

        oauthLoadingProvider = nil
        isLoading = false
    }
    
    // MARK: - Error Handling
    
    /// Handle Clerk API errors with user-friendly messages
    private func handleClerkError(_ error: ClerkAPIError) {
        switch error.code {
        case "form_code_incorrect":
            state = .error(message: "Incorrect code. Please try again.", canRetry: true)
        case "verification_expired":
            state = .error(message: "Code expired. Please request a new one.", canRetry: true)
        case "too_many_requests":
            state = .error(message: "Too many attempts. Please wait and try again.", canRetry: true)
        default:
            // Use the error message from Clerk
            let message = error.longMessage ?? error.message ?? "An error occurred. Please try again."
            state = .error(message: message, canRetry: true)
        }
    }
    
    /// Handle generic errors
    private func handleGenericError(_ error: Error) {
        state = .error(message: "Something went wrong. Please try again.", canRetry: true)
    }
}
