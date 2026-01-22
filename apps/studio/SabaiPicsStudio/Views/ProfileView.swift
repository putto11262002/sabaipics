//
//  ProfileView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//

import SwiftUI
import Clerk

struct ProfileView: View {
    @Environment(\.clerk) private var clerk
    @State private var signOutError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let user = clerk.user {
                        Text(user.id)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Not signed in")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task {
                            do {
                                try await clerk.signOut()
                                signOutError = nil
                            } catch {
                                signOutError = String(describing: error)
                            }
                        }
                    }
                }

                if let signOutError {
                    Section("Error") {
                        Text(signOutError)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}
