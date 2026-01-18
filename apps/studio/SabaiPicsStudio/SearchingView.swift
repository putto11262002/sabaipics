//
//  SearchingView.swift
//  SabaiPicsStudio
//
//  Created on 1/14/26.
//

import SwiftUI

/// Initial view shown when searching for cameras
struct SearchingView: View {
    @Binding var isSearching: Bool

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon and title
            VStack(spacing: 16) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)

                Text("Looking for cameras...")
                    .font(.title2)
                    .fontWeight(.semibold)
            }

            // Instructions
            VStack(alignment: .leading, spacing: 12) {
                InstructionRow(icon: "cable.connector", text: "Connect USB cable to camera")
                InstructionRow(icon: "wifi", text: "Enable WiFi on camera")
            }
            .padding(.horizontal, 40)

            // Loading indicator
            if isSearching {
                ProgressView()
                    .scaleEffect(1.5)
                    .padding(.top, 20)
            }

            Spacer()
        }
        .padding()
    }
}

/// Reusable instruction row component
struct InstructionRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.gray)
                .frame(width: 24)

            Text(text)
                .font(.body)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    SearchingView(isSearching: .constant(true))
}
