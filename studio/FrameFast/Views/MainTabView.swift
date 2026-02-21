//
//  MainTabView.swift
//  FrameFast
//
//  Created: 2026-01-22
//

import SwiftUI
import UIKit

struct MainTabView: View {
    enum Tab {
        case events
        case capture
        case profile
    }

    @State private var selectedTab: Tab = .events
    @StateObject private var captureSessionStore = CaptureSessionStore()
    @State private var captureSheetDetent: PresentationDetent = .large
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var coordinator: AppCoordinator
    @EnvironmentObject private var uploadStatusStore: UploadStatusStore

    var body: some View {
        TabView(selection: $selectedTab) {
            tabContent(EventsHomeView())
                .tabItem {
                    Label("Events", systemImage: "calendar")
                }
                .tag(Tab.events)

            tabContent(CaptureTabRootView(sessionStore: captureSessionStore))
                .tabItem {
                    Label("Capture", systemImage: "camera.circle.fill")
                }
                .tag(Tab.capture)

            tabContent(ProfileView())
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                .tag(Tab.profile)
        }
        .onAppear {
            captureSessionStore.configure(
                uploadManager: coordinator.uploadManager,
                eventIdProvider: { await MainActor.run { coordinator.selectedEventId } }
            )
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                break
            case .inactive, .background:
                // Foreground-only capture: do not keep camera session alive.
                UIApplication.shared.isIdleTimerDisabled = false
                captureSessionStore.disconnect()
            @unknown default:
                break
            }
        }
        .onChange(of: captureSessionStore.state) { _, newState in
            let shouldKeepAwake: Bool
            switch newState {
            case .active:
                shouldKeepAwake = true
            default:
                shouldKeepAwake = false
            }
            UIApplication.shared.isIdleTimerDisabled = shouldKeepAwake
        }
        .onDisappear {
            // Ensure we never keep the device awake when leaving the tab shell.
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .sheet(isPresented: $captureSessionStore.isDetailsPresented) {
            CaptureSessionSheetView(
                cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                eventName: coordinator.selectedEventName,
                startedAt: captureSessionStore.stats.startedAt,
                downloadsCount: captureSessionStore.stats.downloadsCount,
                syncedCount: sheetSyncedCount,
                lastFilename: captureSessionStore.stats.lastFilename,
                recentDownloads: captureSessionStore.recentDownloads,
                captureSession: captureSessionStore.captureSession,
                isDisconnecting: isDisconnecting,
                onDisconnect: {
                    captureSessionStore.disconnect()
                }
            )
            .presentationDetents([.large], selection: $captureSheetDetent)
            .presentationDragIndicator(.visible)
            .presentationBackground(Color(uiColor: .systemGroupedBackground))
        }
    }

    private var isDisconnecting: Bool {
        if case .connecting = captureSessionStore.state { return true }
        return false
    }

    private var sheetSyncedCount: Int {
        guard let session = captureSessionStore.captureSession else { return 0 }
        return session.photos.reduce(into: 0) { acc, photo in
            guard case .completed = photo.status else { return }
            guard let jobId = photo.uploadJobId else { return }
            guard uploadStatusStore.stateByJobId[jobId] == .completed else { return }
            acc += 1
        }
    }

    private var statusForBar: CaptureStatusBarView.Status {
        switch captureSessionStore.state {
        case .idle:
            return .connecting
        case .connecting:
            return .connecting
        case .active:
            return .active
        case .error(let message):
            return .error(message)
        }
    }

    @ViewBuilder
    private func tabContent<Content: View>(_ content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            statusBarInset
        }
    }

    @ViewBuilder
    private var statusBarInset: some View {
        if captureSessionStore.state != .idle {
            CaptureStatusBarView(
                status: statusForBar,
                cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                eventName: coordinator.selectedEventName,
                onOpen: {
                    captureSheetDetent = .large
                    captureSessionStore.isDetailsPresented = true
                },
                onDisconnect: {
                    captureSessionStore.disconnect()
                }
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
    }
}
