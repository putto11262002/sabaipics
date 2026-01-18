//
//  CustomConfirmationOverlay.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  Pure SwiftUI custom alert to avoid iOS 17 RTI bug
//
//  Purpose: Native .alert() creates UIKit windows that trigger global
//  resignFirstResponder, causing RTI corruption with orphaned TextField sessions.
//  This custom overlay stays in SwiftUI layer, avoiding the issue entirely.
//

import SwiftUI

/// Custom alert-style overlay (pure SwiftUI, no UIKit windows)
struct CustomConfirmationOverlay: View {
    let title: String
    let message: String
    let cancelAction: () -> Void
    let confirmAction: () -> Void
    let confirmLabel: String
    let isDestructive: Bool

    init(
        title: String,
        message: String,
        confirmLabel: String = "Confirm",
        isDestructive: Bool = false,
        cancelAction: @escaping () -> Void,
        confirmAction: @escaping () -> Void
    ) {
        self.title = title
        self.message = message
        self.confirmLabel = confirmLabel
        self.isDestructive = isDestructive
        self.cancelAction = cancelAction
        self.confirmAction = confirmAction
    }

    var body: some View {
        ZStack {
            // Dimmed background (like native alert)
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    // Tap outside to cancel
                    cancelAction()
                }

            // Alert card (matches native iOS alert style)
            VStack(spacing: 0) {
                // Title and message section
                VStack(spacing: 8) {
                    Text(title)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .padding(.top, 20)

                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 20)
                }

                Divider()

                // Buttons section (horizontal layout like native alert)
                HStack(spacing: 0) {
                    // Cancel button
                    Button(action: cancelAction) {
                        Text("Cancel")
                            .font(.body)
                            .foregroundColor(.blue)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }

                    Divider()
                        .frame(height: 44)

                    // Confirm button
                    Button(action: confirmAction) {
                        Text(confirmLabel)
                            .font(.body.weight(.semibold))
                            .foregroundColor(isDestructive ? .red : .blue)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
                .frame(height: 44)
            }
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(UIColor.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 0.5)
            )
            .frame(width: 270)
            .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
        }
    }
}

// MARK: - View Modifier

extension View {
    /// Shows a custom confirmation dialog (pure SwiftUI, avoids RTI bug)
    ///
    /// Usage:
    /// ```swift
    /// .customConfirmationDialog(
    ///     isPresented: $showAlert,
    ///     title: "Disconnect?",
    ///     message: "Are you sure?",
    ///     confirmLabel: "Disconnect",
    ///     isDestructive: true
    /// ) {
    ///     // Confirm action
    /// }
    /// ```
    func customConfirmationDialog(
        isPresented: Binding<Bool>,
        title: String,
        message: String,
        confirmLabel: String = "Confirm",
        isDestructive: Bool = false,
        onConfirm: @escaping () -> Void
    ) -> some View {
        ZStack {
            self

            if isPresented.wrappedValue {
                CustomConfirmationOverlay(
                    title: title,
                    message: message,
                    confirmLabel: confirmLabel,
                    isDestructive: isDestructive,
                    cancelAction: {
                        withAnimation(.easeOut(duration: 0.2)) {
                            isPresented.wrappedValue = false
                        }
                    },
                    confirmAction: {
                        withAnimation(.easeOut(duration: 0.2)) {
                            isPresented.wrappedValue = false
                        }
                        // Small delay to let dismiss animation complete
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            onConfirm()
                        }
                    }
                )
                .transition(.opacity)
                .zIndex(999) // Ensure it's on top
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isPresented.wrappedValue)
    }
}

// MARK: - Preview

#Preview {
    PreviewContainer()
}

private struct PreviewContainer: View {
    @State private var showAlert = true

    var body: some View {
        VStack {
            Text("App Content Behind Alert")
                .font(.title)

            Button("Show Alert") {
                showAlert = true
            }
        }
        .customConfirmationDialog(
            isPresented: $showAlert,
            title: "Disconnect from camera?",
            message: "Photos will be cleared. Make sure you've saved what you need.",
            confirmLabel: "Disconnect",
            isDestructive: true
        ) {
            print("Confirmed!")
        }
    }
}
