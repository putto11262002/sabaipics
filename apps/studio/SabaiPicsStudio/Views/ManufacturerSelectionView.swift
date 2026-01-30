//
//  ManufacturerSelectionView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-18
//  SAB-22: Phase 1 - Manufacturer Selection UI
//
//  Entry point for camera connection flow.
//  User selects camera manufacturer before discovering cameras.
//

import SwiftUI

/// Manufacturer selection view - entry point for camera connection
///
/// Shows three manufacturer options: Canon (active), Nikon (active), Sony (grayed)
/// User taps manufacturer to start camera discovery flow
struct ManufacturerSelectionView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator  // CHANGED

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Title
            Text("Select your camera")
                .font(.title3)
                .foregroundColor(Color.Theme.mutedForeground)
                .padding(.bottom, 32)

            // Manufacturer buttons
            VStack(spacing: 16) {
                ForEach(CameraManufacturer.allCases, id: \.self) { manufacturer in
                    ManufacturerButton(
                        manufacturer: manufacturer,
                        isEnabled: manufacturer.isSupported
                    ) {
                        handleManufacturerSelection(manufacturer)
                    }
                }
            }
            .padding(.horizontal, 40)

            Spacer()
            Spacer()
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Handle manufacturer selection
    private func handleManufacturerSelection(_ manufacturer: CameraManufacturer) {
        guard manufacturer.isSupported else {
            print("[ManufacturerSelectionView] \(manufacturer.rawValue) not yet supported")
            return
        }

        print("[ManufacturerSelectionView] Selected: \(manufacturer.rawValue)")
        captureFlow.selectManufacturer(manufacturer)  // CHANGED
    }
}

/// Manufacturer button component
struct ManufacturerButton: View {
    let manufacturer: CameraManufacturer
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            if isEnabled {
                action()
            }
        }) {
            HStack {
                Text(manufacturer.rawValue)
                    .font(.title2)
                    .fontWeight(.semibold)

                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isEnabled ? Color.Theme.primary : Color.Theme.border, lineWidth: 2)
            )
            .foregroundColor(isEnabled ? Color.Theme.foreground : Color.Theme.mutedForeground)
            .opacity(isEnabled ? 1.0 : 0.6)
        }
        .disabled(!isEnabled)
    }
}

// MARK: - Previews

#Preview("Manufacturer Selection") {
    let coordinator = AppCoordinator()
    return ManufacturerSelectionView()
        .environmentObject(coordinator)
}
