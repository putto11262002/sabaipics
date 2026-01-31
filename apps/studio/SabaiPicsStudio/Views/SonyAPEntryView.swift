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
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    // Intentionally unused on this screen (no Settings shortcut here).

    @State private var selectedRecord: SonyAPConnectionRecord?
    @State private var showRecordActions = false

    @State private var records: [SonyAPConnectionRecord] = []

    private var currentNetworkKey: String? {
        SonyAPConnectionCache.shared.currentNetworkKey()
    }

    // Keep WiFi utilities off this entry screen.

    var body: some View {
        VStack(spacing: 0) {
            cameraList

            Button("New camera") {
                captureFlow.startSonySetup()
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    captureFlow.backToManufacturerSelection()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .foregroundColor(Color.Theme.primary)
                }
            }
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
                    captureFlow.connectToSonyRecord(id: record.id)
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
                        SonyAPConnectionCache.shared.deleteRecord(id: record.id)
                    }
                }
            }

            Button("Cancel", role: .cancel) {}
        }
        .onAppear {
            records = SonyAPConnectionCache.shared.listRecords()
        }
    }

    private var cameraList: some View {
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

                            if let currentNetworkKey, currentNetworkKey == record.networkKey {
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
