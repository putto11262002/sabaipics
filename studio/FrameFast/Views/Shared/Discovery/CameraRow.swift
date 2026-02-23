//  CameraRow.swift
//  FrameFast
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
                    .foregroundColor(Color.accentColor)
                    .frame(width: 50, height: 50)
                    .background(Color.accentColor.opacity(0.1))
                    .cornerRadius(10)

                Text(camera.name)
                    .font(.headline)
                    .foregroundColor(Color.primary)

                Spacer()

                if camera.hasActiveSession {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 10, height: 10)
                }

                Image(systemName: "chevron.right")
                    .foregroundColor(Color.secondary)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(UIColor.separator), lineWidth: 1)
            )
        }
    }
}

#if DEBUG

#Preview("Camera Row") {
    CameraRow(
        camera: DiscoveredCamera(
            name: "Canon EOS R5",
            ipAddress: "192.168.1.2",
            connectionNumber: 1,
            session: nil
        ),
        onSelect: {}
    )
    .padding()
}

#Preview("Camera Row — Active Session") {
    CameraRow(
        camera: DiscoveredCamera(
            name: "Nikon Z8",
            ipAddress: "192.168.1.3",
            connectionNumber: 2,
            session: nil
        ),
        onSelect: {}
    )
    .padding()
}

#endif
