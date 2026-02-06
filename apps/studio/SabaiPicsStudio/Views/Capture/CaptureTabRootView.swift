//  CaptureTabRootView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureTabRootView: View {
    @ObservedObject var sessionStore: CaptureSessionStore

    // TODO: This is wrong. It the states be ativeManufacturer?? sony cannon nikon? and flow type as in fresh or reconect?
    @State private var isShowingSonyFlow = false
    @State private var sonyStartMode: SonyConnectFlowView.StartMode = .new
    @State private var recentSony: [SonyAPConnectionRecord] = []

    @State private var pendingSonyReconnectID: String? = nil
    @State private var pendingSonyReconnectSSID: String? = nil
    @State private var isShowingSonyReconnectAlert: Bool = false

    var body: some View {
        NavigationStack {
            CaptureHomeView(
                onConnectNew: {
                    guard sessionStore.state == .idle else { return }
                    sonyStartMode = .new
                    isShowingSonyFlow = true
                },
                recentSony: recentSony,
                onReconnect: { manufacturer, id in
                    guard sessionStore.state == .idle else { return }
                    guard manufacturer.lowercased() == "sony" else { return }

                    let record = SonyAPConnectionCache.shared.listRecords().first(where: { $0.id == id })
                    if let record, let ssid = record.ssid, !ssid.isEmpty {
                        if let currentKey = SonyAPConnectionCache.shared.currentNetworkKey(), currentKey == record.networkKey {
                            sonyStartMode = .reconnect(recordID: id)
                            isShowingSonyFlow = true
                        } else {
                            pendingSonyReconnectID = id
                            pendingSonyReconnectSSID = ssid
                            isShowingSonyReconnectAlert = true
                        }
                    } else {
                        // No SSID saved. Proceed to scan anyway.
                        sonyStartMode = .reconnect(recordID: id)
                        isShowingSonyFlow = true
                    }
                },
                isConnectionMuted: sessionStore.state != .idle
            )
            .navigationDestination(isPresented: $isShowingSonyFlow) {
                SonyConnectFlowView(
                    startMode: sonyStartMode,
                    onConnected: { activeCamera in
                        let shouldAutoOpen = (sessionStore.state == .idle)
                        sessionStore.start(activeCamera: activeCamera)
                        if shouldAutoOpen {
                            sessionStore.isDetailsPresented = true
                        }
                        isShowingSonyFlow = false
                        reloadRecentSony()
                    },
                    onCancel: {
                        isShowingSonyFlow = false
                        reloadRecentSony()
                    }
                )
            }
            .onAppear {
                reloadRecentSony()
            }
        }
        .alert("Reconnect Sony", isPresented: $isShowingSonyReconnectAlert) {
            Button("Cancel", role: .cancel) {
                pendingSonyReconnectID = nil
                pendingSonyReconnectSSID = nil
            }
            Button("OK") {
                guard let id = pendingSonyReconnectID else { return }
                pendingSonyReconnectID = nil
                pendingSonyReconnectSSID = nil

                // Ensure the alert dismisses before navigating.
                isShowingSonyReconnectAlert = false
                DispatchQueue.main.async {
                    sonyStartMode = .reconnect(recordID: id)
                    isShowingSonyFlow = true
                }
            }
        } message: {
            Text("Make sure you are connected to \(pendingSonyReconnectSSID ?? "the camera Wi-Fi").")
        }
    }

    private func reloadRecentSony() {
        recentSony = SonyAPConnectionCache.shared.listRecords()
    }
}

#if DEBUG

#Preview("Capture Tab") {
    CaptureTabRootView(sessionStore: CaptureSessionStore())
}

#endif
