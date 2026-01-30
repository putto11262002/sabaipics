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

    // NEW: Create isolated capture flow state
    @StateObject private var captureFlow = CaptureFlowCoordinator()

    @State private var showExitConfirm = false

    var body: some View {
        NavigationStack {
            ContentView()
                .environmentObject(captureFlow)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showExitConfirm = true
                        } label: {
                            Image(systemName: "xmark.circle")
                                .foregroundStyle(Color.Theme.primary)
                        }
                    }
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
        .onAppear {
            // NEW: Link to global coordinator for transferSession
            captureFlow.appCoordinator = coordinator
        }
    }

    private func exitCapture() async {
        // Clean up current stage (scanner, connections, etc.)
        await captureFlow.cleanup()

        // Clean up transfer session if exists
        if let session = coordinator.transferSession {
            await session.end()
            coordinator.transferSession = nil
        }

        // Reset capture flow state
        captureFlow.state = .manufacturerSelection
        dismiss()
    }
}
