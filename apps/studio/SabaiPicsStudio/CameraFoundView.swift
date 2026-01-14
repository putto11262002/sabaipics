//
//  CameraFoundView.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//

import SwiftUI
import ImageCaptureCore

/// View shown when a camera is detected
struct CameraFoundView: View {
    let camera: ICCameraDevice
    let onConnect: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Camera icon
            VStack(spacing: 16) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.blue)

                VStack(spacing: 8) {
                    Text(camera.name ?? "Camera")
                        .font(.title)
                        .fontWeight(.bold)

                    Text(connectionTypeText)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            // Camera details
            VStack(spacing: 12) {
                DetailRow(label: "Connection", value: connectionTypeText)
                DetailRow(label: "Status", value: "Ready")
            }
            .padding(.horizontal, 40)

            // Connect button
            Button(action: onConnect) {
                Text("Connect Camera")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)

            Spacer()
        }
        .padding()
    }

    private var connectionTypeText: String {
        // In modern ImageCaptureCore, we check the transport type differently
        if let transportType = camera.transportType {
            if transportType.contains("USB") {
                return "USB Connected"
            } else if transportType.contains("WiFi") || transportType.contains("Network") {
                return "WiFi Connected"
            }
        }
        return "Connected"
    }
}

/// Reusable detail row component
struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
    }
}

#Preview {
    // Preview requires a mock camera object
    // In real usage, this will be provided by CameraService
    Text("Camera Found View")
}
