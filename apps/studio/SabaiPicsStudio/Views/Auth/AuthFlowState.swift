//
//  AuthFlowState.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-23
//

import Foundation

/// Social login providers supported by the app (renamed to avoid conflict with Clerk's OAuthProvider)
enum SocialProvider: String, CaseIterable {
    case google
    case line
    
    var displayName: String {
        switch self {
        case .google: return "Google"
        case .line: return "LINE"
        }
    }
}

/// State machine for the custom auth flow (sign-in only, no sign-up)
enum AuthFlowState: Equatable {
    /// Entry screen with provider buttons (Email, Google, LINE)
    case welcome
    
    /// User is entering their email address
    case emailEntry
    
    /// OTP code has been sent, waiting for user to enter it
    /// - Parameter email: the email address OTP was sent to
    case otpPending(email: String)
    
    /// OAuth redirect is in progress
    /// - Parameter provider: which OAuth provider (Google/LINE)
    case oauthLoading(provider: SocialProvider)
    
    /// An error occurred
    /// - Parameter message: user-friendly error message
    /// - Parameter canRetry: whether user can retry the action
    case error(message: String, canRetry: Bool)
    
    /// Account not found - user needs to sign up on web
    /// - Parameter email: the email that wasn't found
    /// - Parameter signUpURL: URL to the web sign-up page
    case accountNotFound(email: String, signUpURL: URL)
}
