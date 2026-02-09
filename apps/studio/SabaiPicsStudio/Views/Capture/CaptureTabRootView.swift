//  CaptureTabRootView.swift
//  SabaiPicsStudio

import SwiftUI

struct CaptureTabRootView: View {
    @ObservedObject var sessionStore: CaptureSessionStore
    @EnvironmentObject private var coordinator: AppCoordinator

    // MARK: - Sheet

    private enum ActiveSheet: Identifiable {
        case sony(SonyConnectFlowView.StartMode)
        case canon(CanonConnectFlowView.StartMode)
        case nikon(NikonConnectFlowView.StartMode)

        var id: String {
            switch self {
            case .sony: return "sony"
            case .canon: return "canon"
            case .nikon: return "nikon"
            }
        }
    }

    @State private var activeSheet: ActiveSheet? = nil
    @State private var pendingActiveSheet: ActiveSheet? = nil
    @State private var isShowingEventPicker: Bool = false
    @State private var recentSony: [APCameraConnectionRecord] = []
    @State private var recentCanon: [APCameraConnectionRecord] = []
    @State private var recentNikon: [APCameraConnectionRecord] = []

    @State private var pendingSonyReconnectID: String? = nil
    @State private var pendingSonyReconnectSSID: String? = nil
    @State private var isShowingSonyReconnectAlert: Bool = false

    @State private var pendingNikonReconnectID: String? = nil
    @State private var pendingNikonReconnectSSID: String? = nil
    @State private var isShowingNikonReconnectAlert: Bool = false

    var body: some View {
        NavigationStack {
            CaptureHomeView(
                onConnectNew: { manufacturer in
                    guard sessionStore.state == .idle else { return }
                    switch manufacturer {
                    case .sony:
                        requestStartCapture(sheet: .sony(.new))
                    case .canon:
                        requestStartCapture(sheet: .canon(.new))
                    case .nikon:
                        requestStartCapture(sheet: .nikon(.new))
                    }
                },
                recentSony: recentSony,
                recentCanon: recentCanon,
                recentNikon: recentNikon,
                onReconnect: { manufacturer, id in
                    guard sessionStore.state == .idle else { return }
                    switch manufacturer.lowercased() {
                    case "sony":
                        handleSonyReconnect(id: id)
                    case "canon":
                        handleCanonReconnect(id: id)
                    case "nikon":
                        handleNikonReconnect(id: id)
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
                    case "nikon":
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
            .sheet(isPresented: $isShowingEventPicker) {
                EventPickerSheetView(
                    preselectedEventId: coordinator.selectedEventId,
                    onCancel: {
                        pendingActiveSheet = nil
                        isShowingEventPicker = false
                    },
                    onConfirm: { eventId in
                        coordinator.selectEvent(id: eventId)
                        let next = pendingActiveSheet
                        pendingActiveSheet = nil
                        isShowingEventPicker = false

                        // Open connect flow after event selection.
                        if let next {
                            DispatchQueue.main.async {
                                activeSheet = next
                            }
                        }
                    }
                )
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
                    requestStartCapture(sheet: .sony(.reconnect(recordID: id)))
                }
            }
        } message: {
            Text("Make sure you are connected to \(pendingSonyReconnectSSID ?? "the camera Wi-Fi").")
        }
        // MARK: Nikon reconnect alert
        .alert("Reconnect Nikon", isPresented: $isShowingNikonReconnectAlert) {
            Button("Cancel", role: .cancel) {
                pendingNikonReconnectID = nil
                pendingNikonReconnectSSID = nil
            }
            Button("OK") {
                guard let id = pendingNikonReconnectID else { return }
                pendingNikonReconnectID = nil
                pendingNikonReconnectSSID = nil
                isShowingNikonReconnectAlert = false
                DispatchQueue.main.async {
                    requestStartCapture(sheet: .nikon(.reconnect(recordID: id)))
                }
            }
        } message: {
            Text("Make sure you are connected to \(pendingNikonReconnectSSID ?? "the camera Wi-Fi").")
        }
    }

    private func requestStartCapture(sheet: ActiveSheet) {
        pendingActiveSheet = sheet
        isShowingEventPicker = true
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

        case .nikon(let startMode):
            NavigationStack {
                NikonConnectFlowView(
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
                    requestStartCapture(sheet: .sony(.reconnect(recordID: id)))
                } else {
                    pendingSonyReconnectID = id
                    pendingSonyReconnectSSID = ssid
                    isShowingSonyReconnectAlert = true
                }
            } else {
                requestStartCapture(sheet: .sony(.reconnect(recordID: id)))
            }

        case .personalHotspot:
            // Shouldn't happen for Sony, but treat as generic scan.
            requestStartCapture(sheet: .sony(.reconnect(recordID: id)))
        }
    }

    private func handleCanonReconnect(id: String) {
        let recordID = UUID(uuidString: id)
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
            .first(where: { $0.id == recordID })
        let mode = record?.connectionMode ?? .unknown
        if mode == .personalHotspot {
            // Show Canon setup sheet first; user can continue to discovery.
            requestStartCapture(sheet: .canon(.new))
        } else {
            requestStartCapture(sheet: .canon(.reconnect(recordID: id)))
        }
    }

    private func handleNikonReconnect(id: String) {
        let recordID = UUID(uuidString: id)
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .nikon)
            .first(where: { $0.id == recordID })

        if let currentKey = WiFiNetworkInfo.currentNetworkKey(), currentKey == record?.networkKey {
            requestStartCapture(sheet: .nikon(.reconnect(recordID: id)))
            return
        }

        pendingNikonReconnectID = id
        pendingNikonReconnectSSID = record?.ssid
        isShowingNikonReconnectAlert = true
    }

    // MARK: - Data

    private func reloadRecent() {
        recentSony = APCameraConnectionStore.shared.listRecords(manufacturer: .sony)
        recentCanon = APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
        recentNikon = APCameraConnectionStore.shared.listRecords(manufacturer: .nikon)
    }
}

#if DEBUG

#Preview("Capture Tab") {
    CaptureTabRootView(sessionStore: CaptureSessionStore())
        .environmentObject(AppCoordinator())
}

#endif
