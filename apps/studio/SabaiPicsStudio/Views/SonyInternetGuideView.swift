//  SonyInternetGuideView.swift
//  SabaiPicsStudio
//
//  Optional advanced guide: regain cellular internet while connected to camera WiFi.
//  Based on the PhotoSync approach (manual IP config).
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct SonyInternetGuideView: View {
    @Environment(\.dismiss) var dismiss
    let wifiInfo: WiFiIPv4Info?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Real-time upload while on camera WiFi")
                        .font(.title3)
                        .fontWeight(.semibold)

                    Text("Camera WiFi usually has no internet. You can change the WiFi settings to let iOS use cellular for internet while staying connected to the camera.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)

                    Divider()

                    Text("Steps")
                        .font(.headline)

                    Text("1) Open Settings > Wi-Fi")
                    Text("2) Tap the (i) next to the camera WiFi")
                    Text("3) Note the IP Address and Subnet Mask")
                    Text("4) Tap Configure IP > Manual")
                    Text("5) Re-enter the same IP Address + Subnet Mask and Save")

                    if let wifiInfo {
                        Divider()

                        Text("Your current values")
                            .font(.headline)

                        SonyCopyRow(label: "IP Address", value: wifiInfo.ipString)
                        SonyCopyRow(label: "Subnet Mask", value: wifiInfo.netmaskString)

                        Text("These should match what you see in Settings.")
                            .font(.caption)
                            .foregroundColor(Color.Theme.mutedForeground)
                    }

                    Divider()

                    Text("Note")
                        .font(.headline)
                    Text("This is optional. SabaiPics Studio can transfer photos locally without internet, then upload later when you reconnect to a normal network.")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                }
                .padding(20)
            }
            .navigationTitle("Internet Guide")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Color.Theme.primary)
                }
            }
        }
    }
}

private struct SonyCopyRow: View {
    let label: String
    let value: String

    @State private var didCopy = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                Text(value)
                    .font(.headline)
                    .foregroundColor(Color.Theme.foreground)
            }

            Spacer()

            Button(didCopy ? "Copied" : "Copy") {
                #if canImport(UIKit)
                UIPasteboard.general.string = value
                #endif
                didCopy = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    didCopy = false
                }
            }
            .buttonStyle(.secondary)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.Theme.border, lineWidth: 1)
        )
    }
}
