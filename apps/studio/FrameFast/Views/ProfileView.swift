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
    @State private var showAccountPortal = false
    @State private var legalURL: URL?

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
                                    .foregroundStyle(Color.Theme.foreground)

                                if let email = user.primaryEmailAddress?.emailAddress {
                                    Text(email)
                                        .font(.footnote)
                                        .foregroundStyle(Color.Theme.mutedForeground)
                                }
                            }

                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                        .sabaiCardRow()
                    } else {
                        Text("Not signed in")
                            .foregroundStyle(.secondary)
                            .sabaiCardRow()
                    }
                }

                Section {
                    Button {
                        showAccountPortal = true
                    } label: {
                        profileRowLabel(
                            title: "Manage Account",
                            systemImage: "person.crop.circle",
                            foreground: Color.Theme.foreground,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    .sabaiCardRow()

                    Button {
                        Task {
                            try? await clerk.signOut()
                        }
                    } label: {
                        profileRowLabel(
                            title: "Sign Out",
                            systemImage: "rectangle.portrait.and.arrow.right",
                            foreground: Color.Theme.destructive,
                            showsChevron: false
                        )
                    }
                    .buttonStyle(.plain)
                    .sabaiCardRow()
                }

                Section("Legal") {
                    Button {
                        legalURL = URL(string: "https://framefast.io/terms")
                    } label: {
                        profileRowLabel(
                            title: "Terms of Service",
                            systemImage: "doc.text",
                            foreground: Color.Theme.foreground,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    .sabaiCardRow()

                    Button {
                        legalURL = URL(string: "https://framefast.io/privacy")
                    } label: {
                        profileRowLabel(
                            title: "Privacy Policy",
                            systemImage: "hand.raised",
                            foreground: Color.Theme.foreground,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    .sabaiCardRow()
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
            }
            .sheet(isPresented: $showAccountPortal) {
                UserProfileView()
            }
            .sheet(item: $legalURL) { url in
                SafariView(url: url)
                    .ignoresSafeArea()
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
