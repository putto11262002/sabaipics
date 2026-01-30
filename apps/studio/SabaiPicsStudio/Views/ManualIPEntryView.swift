//
//  ManualIPEntryView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Updated: 2026-01-19 - Transfer Session Architecture
//  Professional WiFi camera setup UI for iPad
//

import SwiftUI

/// Main WiFi setup view for connecting to Canon cameras
/// Used for manual IP entry (fallback from auto-discovery)
struct ManualIPEntryView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // CHANGED
    @State private var cameraIP: String = "172.20.10.2"  // Default to hotspot IP range
    @State private var showInstructions = false
    @State private var showPermissionError = false
    @FocusState private var isIPFieldFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Top section with icon and title
                VStack(spacing: 20) {
                Spacer()
                    .frame(height: 60)

                // WiFi icon with gradient
                Image(systemName: "wifi.circle.fill")
                    .font(.system(size: 50))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.Theme.primary, Color.Theme.primary.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Title
                Text("Enter Camera IP")
                    .font(.title)
                    .fontWeight(.bold)

                Spacer()
                    .frame(height: 40)
            }

            // IP Address input section
            VStack(alignment: .leading, spacing: 12) {
                Text("Camera IP Address")
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)

                TextField("192.168.1.1", text: $cameraIP)
                    .textFieldStyle(.themed(isFocused: $isIPFieldFocused))
                    .keyboardType(.numbersAndPunctuation)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .focused($isIPFieldFocused)
            }
            .padding(.horizontal, 32)

            Spacer()
                .frame(height: 32)

            // Permission error message (if shown)
            if showPermissionError {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text("Local network access required")
                            .font(.headline)
                    }

                    Text("SabaiPics Studio needs permission to discover cameras on your network.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    Text("Enable in: Settings > Privacy > Local Network")
                        .font(.caption)
                        .foregroundColor(Color.Theme.primary)
                }
                .padding()
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
            }

            // Connect button
            Button(action: {
                // Properly clean up input session before transitioning away
                isIPFieldFocused = false
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                               to: nil, from: nil, for: nil)

                // Then connect via capture flow (Path 2: Manual IP)
                captureFlow.connectManualIP(cameraIP)  // CHANGED
            }) {
                HStack(spacing: 12) {
                    Image(systemName: "wifi")
                        .font(.title3)
                    Text("Connect Camera")
                        .font(.headline)
                }
            }
            .buttonStyle(.primary)
            .disabled(cameraIP.isEmpty)
            .padding(.horizontal, 32)

            Spacer()
                .frame(height: 24)

            // Help button
            Button(action: { showInstructions = true }) {
                HStack(spacing: 8) {
                    Image(systemName: "questionmark.circle.fill")
                        .font(.subheadline)
                    Text("How do I find my camera's IP?")
                        .font(.subheadline)
                }
                .foregroundColor(Color.Theme.primary)
                .padding(.vertical, 12)
            }

                Spacer()
            }
        }
        .background(Color(.systemBackground))
        .sheet(isPresented: $showInstructions) {
            CanonWiFiInstructionsView()
        }
    }
}

// MARK: - Instructions Sheet

/// Instructions sheet for Canon WiFi setup
struct CanonWiFiInstructionsView: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            VStack {
                Spacer()

                Text("Unavailable")
                    .font(.title2)
                    .foregroundColor(Color.Theme.mutedForeground)

                Spacer()
            }
            .navigationTitle("Help")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(Color.Theme.primary)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    let coordinator = AppCoordinator()

    return ManualIPEntryView()
        .environmentObject(coordinator)
}
