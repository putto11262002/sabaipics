//  SonyAPEntryView.swift
//  SabaiPicsStudio
//
//  Sony entry screen: quick-connect to last camera or set up a new one.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct SonyAPEntryView: View {
    @EnvironmentObject var captureFlow: CaptureFlowCoordinator
    @Environment(\.openURL) private var openURL

    @State private var showHiddenDebug = false

    private var wifiInfo: WiFiIPv4Info? {
        WiFiNetworkInfo.currentWiFiIPv4()
    }

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            Image(systemName: "camera.fill")
                .font(.system(size: 64))
                .foregroundColor(Color.Theme.primary)

            Text("Sony Cameras")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Color.Theme.foreground)
                .onLongPressGesture {
                    showHiddenDebug = true
                }

            cameraList
                .padding(.horizontal, 12)

            Spacer()

            VStack(spacing: 10) {
                Button("Set up a New Camera") {
                    captureFlow.startSonySetup()
                }
                .buttonStyle(.secondary)

                Button("Enter IP Manually") {
                    captureFlow.skipToManualEntry()
                }
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)

                Button("Open Settings") {
                    #if canImport(UIKit)
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                    #endif
                }
                .font(.subheadline)
                .foregroundColor(Color.Theme.mutedForeground)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
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
        .sheet(isPresented: $showHiddenDebug) {
            SonyHiddenNetworkDebugSheet(wifiInfo: wifiInfo)
        }
    }

    private var cameraList: some View {
        let records = SonyAPConnectionCache.shared.listRecords()
        return Group {
            if records.isEmpty {
                Text("No saved cameras yet")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            } else {
                List {
                    ForEach(records) { record in
                        Text(record.cameraName)
                            .foregroundColor(Color.Theme.foreground)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                captureFlow.connectToSonyRecord(id: record.id)
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    Task { @MainActor in
                                        SonyAPConnectionCache.shared.deleteRecord(id: record.id)
                                    }
                                } label: {
                                    Text("Remove")
                                }
                            }
                    }
                }
                .listStyle(.plain)
                .frame(maxWidth: .infinity)
                .frame(height: min(CGFloat(records.count) * 54.0 + 20.0, 360.0))
            }
        }
    }
}

private struct SonyHiddenNetworkDebugSheet: View {
    @Environment(\.dismiss) var dismiss
    let wifiInfo: WiFiIPv4Info?

    @State private var didCopyIP = false
    @State private var didCopyMask = false

    var body: some View {
        NavigationView {
            VStack(spacing: 14) {
                Text("Copy Network Values")
                    .font(.headline)

                if let wifiInfo {
                    Button(didCopyIP ? "Copied IP" : "Copy WiFi IP") {
                        #if canImport(UIKit)
                        UIPasteboard.general.string = wifiInfo.ipString
                        #endif
                        didCopyIP = true
                    }
                    .buttonStyle(.secondary)

                    Button(didCopyMask ? "Copied Subnet" : "Copy Subnet Mask") {
                        #if canImport(UIKit)
                        UIPasteboard.general.string = wifiInfo.netmaskString
                        #endif
                        didCopyMask = true
                    }
                    .buttonStyle(.secondary)
                } else {
                    Text("WiFi not detected")
                        .font(.subheadline)
                        .foregroundColor(Color.Theme.mutedForeground)
                }

                Spacer()
            }
            .padding(20)
            .navigationTitle("Debug")
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
