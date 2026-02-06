//  CaptureTabRootView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureTabRootView: View {
    @ObservedObject var sessionStore: CaptureSessionStore

    // MARK: - Sheet

    private enum ActiveSheet: Identifiable {
        case sony(SonyConnectFlowView.StartMode)
        case canon(CanonConnectFlowView.StartMode)

        var id: String {
            switch self {
            case .sony: return "sony"
            case .canon: return "canon"
            }
        }
    }

    @State private var activeSheet: ActiveSheet? = nil
    @State private var recentSony: [APCameraConnectionRecord] = []
    @State private var recentCanon: [APCameraConnectionRecord] = []

    @State private var pendingSonyReconnectID: String? = nil
    @State private var pendingSonyReconnectSSID: String? = nil
    @State private var isShowingSonyReconnectAlert: Bool = false

    var body: some View {
        NavigationStack {
            CaptureHomeView(
                onConnectNew: { manufacturer in
                    guard sessionStore.state == .idle else { return }
                    switch manufacturer {
                    case .sony:
                        activeSheet = .sony(.new)
                    case .canon:
                        activeSheet = .canon(.new)
                    case .nikon:
                        break // TODO: Nikon flow
                    }
                },
                recentSony: recentSony,
                recentCanon: recentCanon,
                onReconnect: { manufacturer, id in
                    guard sessionStore.state == .idle else { return }
                    switch manufacturer.lowercased() {
                    case "sony":
                        handleSonyReconnect(id: id)
                    case "canon":
                        handleCanonReconnect(id: id)
                    default:
                        break
                    }
                },
                onRemoveRecent: { manufacturer, id in
                    switch manufacturer.lowercased() {
                    case "sony":
                        APCameraConnectionStore.shared.deleteRecord(id: id)
                    case "canon":
                        APCameraConnectionStore.shared.deleteRecord(id: id)
                    default:
                        break
                    }
                    reloadRecent()
                },
                isConnectionMuted: sessionStore.state != .idle
            )
            .sheet(item: $activeSheet) { sheet in
                sheetContent(sheet)
                    .interactiveDismissDisabled(true)
                    .presentationDragIndicator(.hidden)
            }
            .onAppear {
                reloadRecent()
            }
        }
        // MARK: Sony reconnect alert
        .alert("Reconnect Sony", isPresented: $isShowingSonyReconnectAlert) {
            Button("Cancel", role: .cancel) {
                pendingSonyReconnectID = nil
                pendingSonyReconnectSSID = nil
            }
            Button("OK") {
                guard let id = pendingSonyReconnectID else { return }
                pendingSonyReconnectID = nil
                pendingSonyReconnectSSID = nil
                isShowingSonyReconnectAlert = false
                DispatchQueue.main.async {
                    activeSheet = .sony(.reconnect(recordID: id))
                }
            }
        } message: {
            Text("Make sure you are connected to \(pendingSonyReconnectSSID ?? "the camera Wi-Fi").")
        }
    }

    // MARK: - Sheet content

    @ViewBuilder
    private func sheetContent(_ sheet: ActiveSheet) -> some View {
        switch sheet {
        case .sony(let startMode):
            NavigationStack {
                SonyConnectFlowView(
                    startMode: startMode,
                    onConnected: { activeCamera in
                        sessionStore.start(activeCamera: activeCamera)
                        activeSheet = nil
                        reloadRecent()
                    },
                    onCancel: {
                        activeSheet = nil
                        reloadRecent()
                    }
                )
            }
        case .canon(let startMode):
            NavigationStack {
                CanonConnectFlowView(
                    startMode: startMode,
                    onConnected: { activeCamera in
                        sessionStore.start(activeCamera: activeCamera)
                        activeSheet = nil
                        reloadRecent()
                    },
                    onCancel: {
                        activeSheet = nil
                        reloadRecent()
                    }
                )
            }
        }
    }

    // MARK: - Reconnect handlers

    private func handleSonyReconnect(id: String) {
        let recordID = UUID(uuidString: id)
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .sony)
            .first(where: { $0.id == recordID })

        let mode = record?.connectionMode ?? .unknown
        switch mode {
        case .cameraHotspot, .unknown, .sameWifi:
            if let ssid = record?.ssid, !ssid.isEmpty {
                if let currentKey = WiFiNetworkInfo.currentNetworkKey(), currentKey == record?.networkKey {
                    activeSheet = .sony(.reconnect(recordID: id))
                } else {
                    pendingSonyReconnectID = id
                    pendingSonyReconnectSSID = ssid
                    isShowingSonyReconnectAlert = true
                }
            } else {
                activeSheet = .sony(.reconnect(recordID: id))
            }

        case .personalHotspot:
            // Shouldn't happen for Sony, but treat as generic scan.
            activeSheet = .sony(.reconnect(recordID: id))
        }
    }

    private func handleCanonReconnect(id: String) {
        let recordID = UUID(uuidString: id)
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
            .first(where: { $0.id == recordID })
        let mode = record?.connectionMode ?? .unknown
        if mode == .personalHotspot {
            // Show Canon setup sheet first; user can continue to discovery.
            activeSheet = .canon(.new)
        } else {
            activeSheet = .canon(.reconnect(recordID: id))
        }
    }

    // MARK: - Data

    private func reloadRecent() {
        recentSony = APCameraConnectionStore.shared.listRecords(manufacturer: .sony)
        recentCanon = APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
    }
}

#if DEBUG

#Preview("Capture Tab") {
    CaptureTabRootView(sessionStore: CaptureSessionStore())
}

#endif
