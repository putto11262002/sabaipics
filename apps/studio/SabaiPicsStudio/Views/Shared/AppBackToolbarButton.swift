//
//  AppBackToolbarButton.swift
//  SabaiPicsStudio
//
//  Reusable navigation-bar Back toolbar item with optional confirmation.
//

import SwiftUI

struct AppBackConfirmation {
    var title: String
    var message: String
    var confirmTitle: String = "Go Back"
    var confirmRole: ButtonRole? = .destructive
    var cancelTitle: String = "Cancel"
}

private struct AppBackToolbarButtonModifier: ViewModifier {
    let title: String
    let confirmation: AppBackConfirmation?
    let action: () async -> Void

    @State private var showConfirmation = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        if confirmation != nil {
                            showConfirmation = true
                        } else {
                            Task { await action() }
                        }
                    } label: {
                        Label(title, systemImage: "chevron.left")
                    }
                    .foregroundStyle(Color.Theme.primary)
                }
            }
            .alert(confirmation?.title ?? "", isPresented: $showConfirmation) {
                if let confirmation {
                    Button(confirmation.cancelTitle, role: .cancel) {}
                    Button(confirmation.confirmTitle, role: confirmation.confirmRole) {
                        Task { await action() }
                    }
                }
            } message: {
                Text(confirmation?.message ?? "")
            }
    }
}

extension View {
    func appBackButton(
        title: String = "Back",
        confirmation: AppBackConfirmation? = nil,
        action: @escaping () async -> Void
    ) -> some View {
        modifier(
            AppBackToolbarButtonModifier(
                title: title,
                confirmation: confirmation,
                action: action
            )
        )
    }
}

