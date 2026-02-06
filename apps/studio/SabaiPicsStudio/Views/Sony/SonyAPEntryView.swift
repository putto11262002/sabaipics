//  SonyAPEntryView.swift
//  SabaiPicsStudio
//
//  Sony entry screen: quick-connect to last camera or set up a new one.
//

import SwiftUI
import Foundation
#if canImport(UIKit)
import UIKit
#endif
#if canImport(NetworkExtension)
import NetworkExtension
#endif


struct SonyAPEntryView: View {
    let onBack: () -> Void
    let onNewCamera: () -> Void
    let onConnectRecord: (String) -> Void

    @State private var selectedRecord: APCameraConnectionRecord?
    @State private var showRecordActions = false

    @State private var records: [APCameraConnectionRecord] = []

    private var currentNetworkKey: String? {
        WiFiNetworkInfo.currentNetworkKey()
    }

    // Keep WiFi utilities off this entry screen.

    var body: some View {
        VStack(spacing: 0) {
            cameraList

            Button("New camera") {
                onNewCamera()
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            onBack()
        }
        .confirmationDialog(
            "",
            isPresented: $showRecordActions,
            titleVisibility: .hidden
        ) {
            if let record = selectedRecord {
                let isOnSameNetwork = (currentNetworkKey != nil && currentNetworkKey == record.networkKey)

                if !isOnSameNetwork {
                    let ssidHint = record.ssid ?? "DIRECT-..."
                    Text("Join WiFi \"\(ssidHint)\" to connect.")
                        .font(.footnote)
                        .foregroundColor(Color.Theme.mutedForeground)
                }

                Button("Connect") {
                    onConnectRecord(record.id.uuidString)
                }
                .disabled(!isOnSameNetwork)

                Button("Copy IP Address") {
                    #if canImport(UIKit)
                    UIPasteboard.general.string = record.lastKnownCameraIP
                    #endif
                }

                Button("Copy Subnet") {
                    #if canImport(UIKit)
                    let wifiMask = WiFiNetworkInfo.currentWiFiIPv4()?.netmaskString
                    let fallbackMask: String? = {
                        guard let key = record.networkKey else { return nil }
                        // key: "subnet:192.168.122.0/255.255.255.0"
                        return key.split(separator: "/").last.map(String.init)
                    }()
                    UIPasteboard.general.string = wifiMask ?? fallbackMask
                    #endif
                }

                Button("Remove", role: .destructive) {
                    Task { @MainActor in
                        // Optimistically update UI immediately.
                        records.removeAll(where: { $0.id == record.id })
                        APCameraConnectionStore.shared.deleteRecord(id: record.id)
                    }
                }
            }

            Button("Cancel", role: .cancel) {}
        }
        .onAppear {
            records = APCameraConnectionStore.shared.listRecords(manufacturer: .sony)
        }
    }

    private var cameraList: some View {
        let currentKey = currentNetworkKey
        return List {
            Section {
                if records.isEmpty {
                    Text("No saved cameras")
                        .foregroundColor(Color.Theme.mutedForeground)
                } else {
                    ForEach(records) { record in
                        HStack(spacing: 10) {
                            Text(record.cameraName)
                                .foregroundColor(Color.Theme.foreground)

                            Spacer(minLength: 0)

                            if let currentKey, currentKey == record.networkKey {
                                Circle()
                                    .fill(Color.green)
                                    .frame(width: 8, height: 8)
                            } else {
                                Circle()
                                    .fill(Color.Theme.border)
                                    .frame(width: 8, height: 8)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedRecord = record
                            showRecordActions = true
                        }
                    }
                }
            } header: {
                Text("Saved")
            }
        }
        .listStyle(.insetGrouped)
    }
}
