//
//  WiFiSetupView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Professional WiFi camera setup UI for iPad
//

import SwiftUI

/// Main WiFi setup view for connecting to Canon cameras
struct WiFiSetupView: View {
    @ObservedObject var viewModel: CameraViewModel
    @State private var cameraIP: String = "192.168.1.1"
    @State private var showInstructions = false
    @State private var showPermissionError = false
    @FocusState private var isIPFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Top section with icon and title
            VStack(spacing: 20) {
                Spacer()
                    .frame(height: 60)

                // WiFi icon with gradient
                Image(systemName: "wifi.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.blue, .blue.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Title
                Text("Connect to Camera")
                    .font(.title)
                    .fontWeight(.bold)

                // Subtitle
                Text("Enter your Canon camera's WiFi IP address")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                Spacer()
                    .frame(height: 40)
            }

            // IP Address input section
            VStack(alignment: .leading, spacing: 12) {
                Text("Camera IP Address")
                    .font(.headline)
                    .foregroundColor(.primary)

                TextField("192.168.1.1", text: $cameraIP)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .keyboardType(.numbersAndPunctuation)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .focused($isIPFieldFocused)
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.systemGray6))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isIPFieldFocused ? Color.blue : Color.clear, lineWidth: 2)
                    )

                Text("Usually starts with 192.168")
                    .font(.caption)
                    .foregroundColor(.secondary)
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
                        .foregroundColor(.secondary)

                    Text("Enable in: Settings > Privacy > Local Network")
                        .font(.caption)
                        .foregroundColor(.blue)
                }
                .padding()
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
            }

            // Connect button
            Button(action: {
                isIPFieldFocused = false
                viewModel.connectToWiFiCamera(ip: cameraIP)
            }) {
                HStack(spacing: 12) {
                    Image(systemName: "wifi")
                        .font(.title3)
                    Text("Connect Camera")
                        .font(.headline)
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(cameraIP.isEmpty ? Color.gray : Color.blue)
                )
                .shadow(color: .blue.opacity(0.3), radius: 8, x: 0, y: 4)
            }
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
                .foregroundColor(.blue)
                .padding(.vertical, 12)
            }

            Spacer()
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
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)

                        Text("Canon WiFi Setup")
                            .font(.title)
                            .fontWeight(.bold)

                        Text("Follow these steps to enable WiFi on your Canon camera")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.bottom, 8)

                    Divider()

                    // Steps
                    InstructionStep(
                        number: 1,
                        title: "Enable WiFi on Camera",
                        description: "Press Menu button → Navigate to WiFi Settings → Enable WiFi"
                    )

                    InstructionStep(
                        number: 2,
                        title: "Connect iPad to Camera WiFi",
                        description: "Open iPad Settings → WiFi → Select your camera's network"
                    )

                    InstructionStep(
                        number: 3,
                        title: "Find Camera IP Address",
                        description: "Camera LCD will display IP address (usually 192.168.1.1)"
                    )

                    Divider()

                    // Camera mode note
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(.blue)
                            Text("Camera Settings")
                                .font(.headline)
                        }

                        Text("Set your camera to JPEG or JPEG+RAW mode. SabaiPics Studio only downloads JPEG files for fast transfer.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(12)
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Instruction Step Component

/// Reusable instruction step component with number badge
struct InstructionStep: View {
    let number: Int
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Number badge
            ZStack {
                Circle()
                    .fill(Color.blue)
                    .frame(width: 32, height: 32)

                Text("\(number)")
                    .font(.headline)
                    .foregroundColor(.white)
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)

                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    WiFiSetupView(viewModel: CameraViewModel())
}
