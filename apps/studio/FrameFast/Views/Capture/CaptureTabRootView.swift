//  CaptureTabRootView.swift
//  FrameFast

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
    @State private var isShowingEventPicker: Bool = false
    @State private var recentCameras: [APCameraConnectionRecord] = []

    @State private var isShowingAddCameraDialog: Bool = false

    @State private var pendingSonyReconnectID: String? = nil
    @State private var pendingSonyReconnectSSID: String? = nil
    @State private var isShowingSonyReconnectAlert: Bool = false

    @State private var pendingNikonReconnectID: String? = nil
    @State private var pendingNikonReconnectSSID: String? = nil
    @State private var isShowingNikonReconnectAlert: Bool = false

    var body: some View {
        NavigationStack {
            CaptureHomeView(
                onAddCameraTap: {
                    guard sessionStore.state == .idle else { return }
                    isShowingAddCameraDialog = true
                },
                recentCameras: recentCameras,
                onReconnect: { manufacturer, id in
                    guard sessionStore.state == .idle else { return }
                    switch manufacturer {
                    case .sony:
                        handleSonyReconnect(id: id)
                    case .canon:
                        handleCanonReconnect(id: id)
                    case .nikon:
                        handleNikonReconnect(id: id)
                    }
                },
                onRemoveRecent: { manufacturer, id in
                    APCameraConnectionStore.shared.deleteRecord(id: id)
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
                        isShowingEventPicker = false
                        sessionStore.disconnect()
                    },
                    onConfirm: { eventId, eventName in
                        coordinator.selectEvent(id: eventId, name: eventName)
                        isShowingEventPicker = false

                        sessionStore.startPendingCamera()
                        reloadRecent()
                    }
                )
                .interactiveDismissDisabled(true)
                .presentationDragIndicator(.hidden)
            }
            .onAppear {
                reloadRecent()
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ConnectivityStatusToolbarView()
                }
            }
            .confirmationDialog(
                "Add camera",
                isPresented: $isShowingAddCameraDialog,
                titleVisibility: .visible
            ) {
                ForEach(CameraManufacturer.allCases, id: \.self) { manufacturer in
                    Button(manufacturer.rawValue) {
                        handleConnectNew(manufacturer)
                    }
                }
                Button("Cancel", role: .cancel) { }
            }
            .onChange(of: sessionStore.state) { _, newState in
                if newState != .idle {
                    isShowingAddCameraDialog = false
                }
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
        activeSheet = sheet
    }

    private func handleConnectNew(_ manufacturer: CameraManufacturer) {
        guard sessionStore.state == .idle else { return }
        switch manufacturer {
        case .sony:
            requestStartCapture(sheet: .sony(.new))
        case .canon:
            requestStartCapture(sheet: .canon(.new))
        case .nikon:
            requestStartCapture(sheet: .nikon(.new))
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
                        sessionStore.setPendingCamera(activeCamera)
                        activeSheet = nil
                        reloadRecent()
                        DispatchQueue.main.async {
                            isShowingEventPicker = true
                        }
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
                        sessionStore.setPendingCamera(activeCamera)
                        activeSheet = nil
                        reloadRecent()
                        DispatchQueue.main.async {
                            isShowingEventPicker = true
                        }
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
                        sessionStore.setPendingCamera(activeCamera)
                        activeSheet = nil
                        reloadRecent()
                        DispatchQueue.main.async {
                            isShowingEventPicker = true
                        }
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

    private func handleSonyReconnect(id: UUID) {
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .sony)
            .first(where: { $0.id == id })

        let mode = record?.connectionMode ?? .unknown
        switch mode {
        case .cameraHotspot, .unknown, .sameWifi:
            if let ssid = record?.ssid, !ssid.isEmpty {
                if let currentKey = WiFiNetworkInfo.currentNetworkKey(), currentKey == record?.networkKey {
                    requestStartCapture(sheet: .sony(.reconnect(recordID: id.uuidString)))
                } else {
                    pendingSonyReconnectID = id.uuidString
                    pendingSonyReconnectSSID = ssid
                    isShowingSonyReconnectAlert = true
                }
            } else {
                requestStartCapture(sheet: .sony(.reconnect(recordID: id.uuidString)))
            }

        case .personalHotspot:
            // Shouldn't happen for Sony, but treat as generic scan.
            requestStartCapture(sheet: .sony(.reconnect(recordID: id.uuidString)))
        }
    }

    private func handleCanonReconnect(id: UUID) {
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .canon)
            .first(where: { $0.id == id })
        let mode = record?.connectionMode ?? .unknown
        if mode == .personalHotspot {
            // Show Canon setup sheet first; user can continue to discovery.
            requestStartCapture(sheet: .canon(.new))
        } else {
            requestStartCapture(sheet: .canon(.reconnect(recordID: id.uuidString)))
        }
    }

    private func handleNikonReconnect(id: UUID) {
        let record = APCameraConnectionStore.shared.listRecords(manufacturer: .nikon)
            .first(where: { $0.id == id })

        if let currentKey = WiFiNetworkInfo.currentNetworkKey(), currentKey == record?.networkKey {
            requestStartCapture(sheet: .nikon(.reconnect(recordID: id.uuidString)))
            return
        }

        pendingNikonReconnectID = id.uuidString
        pendingNikonReconnectSSID = record?.ssid
        isShowingNikonReconnectAlert = true
    }

    // MARK: - Data

    private func reloadRecent() {
        recentCameras = APCameraConnectionStore.shared.listRecords()
    }
}

#if DEBUG

#Preview("Capture Tab") {
    CaptureTabRootView(sessionStore: CaptureSessionStore())
        .environmentObject(AppCoordinator())
}

#endif
