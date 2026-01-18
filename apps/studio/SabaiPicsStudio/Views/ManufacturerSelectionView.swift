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
    @EnvironmentObject var coordinator: AppCoordinator

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                Spacer()

                // Title
                VStack(spacing: 8) {
                    Text("Select Camera Brand")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("Choose your camera manufacturer to begin")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
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
        .navigationViewStyle(.stack)
    }

    /// Handle manufacturer selection
    private func handleManufacturerSelection(_ manufacturer: CameraManufacturer) {
        guard manufacturer.isSupported else {
            print("[ManufacturerSelectionView] \(manufacturer.rawValue) not yet supported")
            return
        }

        print("[ManufacturerSelectionView] Selected: \(manufacturer.rawValue)")

        // TODO: Navigate to CameraDiscoveryView
        // For now, transition to .idle (will be updated in Phase 2)
        coordinator.selectManufacturer(manufacturer)
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

                if !isEnabled {
                    Text("Coming Soon")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.secondary.opacity(0.2))
                        .cornerRadius(12)
                }
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isEnabled ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isEnabled ? Color.blue : Color.gray.opacity(0.3), lineWidth: 2)
            )
            .foregroundColor(isEnabled ? .primary : .secondary)
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
