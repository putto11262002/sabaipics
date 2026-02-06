//  CameraRow.swift
//  SabaiPicsStudio
//
//  Reusable camera row for discovery lists.

import SwiftUI

/// Single camera row in the discovery list.
struct CameraRow: View {
    let camera: DiscoveredCamera
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 16) {
                Image(systemName: "camera.fill")
                    .font(.title2)
                    .foregroundColor(Color.Theme.primary)
                    .frame(width: 50, height: 50)
                    .background(Color.Theme.primary.opacity(0.1))
                    .cornerRadius(10)

                Text(camera.name)
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)

                Spacer()

                if camera.hasActiveSession {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 10, height: 10)
                }

                Image(systemName: "chevron.right")
                    .foregroundColor(Color.Theme.mutedForeground)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
        }
    }
}
