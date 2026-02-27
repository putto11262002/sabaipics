//
//  ProfileView.swift
//  FrameFast
//
//  Created: 2026-01-22
//

import SwiftUI
import Clerk

#if os(iOS)
import UIKit
#endif

struct ProfileView: View {
    @Environment(\.clerk) private var clerk
    @EnvironmentObject private var connectivityStore: ConnectivityStore
    @State private var showAccountPortal = false
    @State private var showFeedback = false
    @State private var legalURL: URL?
    @State private var signOutError: Error?
    @State private var showSignOutError = false

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let user = clerk.user {
                        HStack(spacing: 12) {
                            UserButton()
                                .frame(width: 44, height: 44)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(displayName(for: user))
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(Color.primary)

                                if let email = user.primaryEmailAddress?.emailAddress {
                                    Text(email)
                                        .font(.footnote)
                                        .foregroundStyle(Color.secondary)
                                }
                            }

                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                                            } else {
                        Text("Not signed in")
                            .foregroundStyle(.secondary)
                                                }
                }

                Section {
                    Button {
                        showAccountPortal = true
                    } label: {
                        profileRowLabel(
                            title: "Manage Account",
                            systemImage: connectivityStore.isOnline ? "person.crop.circle" : "wifi.slash",
                            foreground: Color.primary,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                                        .disabled(!connectivityStore.isOnline)
                    .opacity(connectivityStore.isOnline ? 1 : 0.5)

                    Button {
                        showFeedback = true
                    } label: {
                        profileRowLabel(
                            title: "Send Feedback",
                            systemImage: connectivityStore.isOnline ? "bubble.left.and.exclamationmark.bubble.right" : "wifi.slash",
                            foreground: Color.primary,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                                        .disabled(!connectivityStore.isOnline)
                    .opacity(connectivityStore.isOnline ? 1 : 0.5)

                    Button {
                        Task {
                            do {
                                try await clerk.signOut()
                            } catch {
                                signOutError = error
                                showSignOutError = true
                            }
                        }
                    } label: {
                        profileRowLabel(
                            title: "Sign Out",
                            systemImage: "rectangle.portrait.and.arrow.right",
                            foreground: Color.red,
                            showsChevron: false
                        )
                    }
                    .buttonStyle(.plain)
                                        .disabled(!connectivityStore.isOnline)
                    .opacity(connectivityStore.isOnline ? 1 : 0.5)
                }

                Section("Legal") {
                    Button {
                        legalURL = URL(string: "https://framefast.io/terms")
                    } label: {
                        profileRowLabel(
                            title: "Terms of Service",
                            systemImage: "doc.text",
                            foreground: Color.primary,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                                        .disabled(!connectivityStore.isOnline)
                    .opacity(connectivityStore.isOnline ? 1 : 0.5)

                    Button {
                        legalURL = URL(string: "https://framefast.io/privacy")
                    } label: {
                        profileRowLabel(
                            title: "Privacy Policy",
                            systemImage: "hand.raised",
                            foreground: Color.primary,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                                        .disabled(!connectivityStore.isOnline)
                    .opacity(connectivityStore.isOnline ? 1 : 0.5)
                }
            }
            #if os(iOS)
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            #endif
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ConnectivityStatusToolbarView()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    CreditsToolbarView()
                }
            }
            .sheet(isPresented: $showAccountPortal) {
                UserProfileView()
            }
            .sheet(isPresented: $showFeedback) {
                FeedbackView()
            }
            .sheet(item: $legalURL) { url in
                SafariView(url: url)
                    .ignoresSafeArea()
            }
            .alert("Sign Out Failed", isPresented: $showSignOutError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(signOutError?.localizedDescription ?? "An unexpected error occurred. Please try again.")
            }
        }
    }

    private func profileRowLabel(
        title: String,
        systemImage: String,
        foreground: Color,
        showsChevron: Bool
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(foreground)

            Text(title)
                .font(.body)
                .foregroundStyle(foreground)

            Spacer(minLength: 0)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
    
    /// Returns the best display name for the user
    private func displayName(for user: User) -> String {
        // Prefer username if set
        if let username = user.username, !username.isEmpty {
            return username
        }
        // Fallback to full name
        let fullName = [user.firstName, user.lastName]
            .compactMap { $0 }
            .joined(separator: " ")
        if !fullName.isEmpty {
            return fullName
        }
        // Last resort: email prefix
        if let email = user.primaryEmailAddress?.emailAddress {
            return email.components(separatedBy: "@").first ?? "User"
        }
        return "User"
    }
}
