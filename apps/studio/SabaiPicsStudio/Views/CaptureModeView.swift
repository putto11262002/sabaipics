//
//  CaptureModeView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//

import SwiftUI

/// Full-screen container for the existing capture wizard (`ContentView`).
///
/// This provides a single place to exit capture mode back to the main tabs.
struct CaptureModeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var coordinator: AppCoordinator

    @State private var showExitConfirm = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            ContentView()

            Button {
                showExitConfirm = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Close")
                        .font(.system(size: 14, weight: .semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .shadow(color: Color.black.opacity(0.12), radius: 8, x: 0, y: 4)
            }
            .padding(.leading, 14)
            .padding(.top, 12)
        }
        .alert("Exit capture?", isPresented: $showExitConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Exit", role: .destructive) {
                Task { await exitCapture() }
            }
        } message: {
            Text("This will end the current capture session and return to the main menu.")
        }
    }

    private func exitCapture() async {
        if let session = coordinator.transferSession {
            await session.end()
            coordinator.transferSession = nil
        }
        coordinator.backToManufacturerSelection()
        dismiss()
    }
}
