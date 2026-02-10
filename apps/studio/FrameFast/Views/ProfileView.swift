//
//  ProfileView.swift
//  FrameFast
//
//  Created: 2026-01-22
//

import SwiftUI
import Clerk

struct ProfileView: View {
    @Environment(\.clerk) private var clerk
    @State private var showAccountPortal = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = clerk.user {
                        HStack(spacing: 12) {
                            // User avatar
                            UserButton()
                                .frame(width: 44, height: 44)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                // Display name (prefer username, fallback to full name)
                                Text(displayName(for: user))
                                    .font(.body)
                                    .fontWeight(.medium)
                                
                                // Email as secondary info
                                if let email = user.primaryEmailAddress?.emailAddress {
                                    Text(email)
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
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
                        Label("Manage Account", systemImage: "person.crop.circle")
                    }
                    
                    Button {
                        Task {
                            try? await clerk.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ConnectivityStatusToolbarView()
                }
            }
            .sheet(isPresented: $showAccountPortal) {
                UserProfileView()
            }
        }
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
