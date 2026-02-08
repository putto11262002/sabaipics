//
//  MainTabView.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-22
//

import SwiftUI

struct MainTabView: View {
    enum Tab {
        case events
        case capture
        case profile
    }

    @State private var selectedTab: Tab = .events
    @StateObject private var captureSessionStore = CaptureSessionStore()
    @State private var captureSheetDetent: PresentationDetent = .large
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        GeometryReader { proxy in
            TabView(selection: $selectedTab) {
                EventsHomeView()
                    .tabItem {
                        Label("Events", systemImage: "calendar")
                    }
                    .tag(Tab.events)

                CaptureTabRootView(sessionStore: captureSessionStore)
                    .tabItem {
                        Label("Capture", systemImage: "camera.circle.fill")
                    }
                    .tag(Tab.capture)

                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.crop.circle")
                    }
                    .tag(Tab.profile)
            }
            .overlay(alignment: .bottom) {
                if captureSessionStore.state != .idle {
                    CaptureStatusBarView(
                        status: statusForBar,
                        cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                        downloadsCount: captureSessionStore.stats.downloadsCount,
                        lastFilename: captureSessionStore.stats.lastFilename,
                        onOpen: {
                            captureSheetDetent = .large
                            captureSessionStore.isDetailsPresented = true
                        },
                        onDisconnect: {
                            captureSessionStore.disconnect()
                        }
                    )
                    .padding(.horizontal, 16)
                    // Keep the bar above the system TabView bar.
                    .padding(.bottom, proxy.safeAreaInsets.bottom + tabBarClearance)
                }
            }
        }
        .sheet(isPresented: $captureSessionStore.isDetailsPresented) {
            CaptureSessionSheetView(
                cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                startedAt: captureSessionStore.stats.startedAt,
                downloadsCount: captureSessionStore.stats.downloadsCount,
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
        }
    }

    private var tabBarClearance: CGFloat {
        horizontalSizeClass == .regular ? 72 : 56
    }

    private var isDisconnecting: Bool {
        if case .connecting = captureSessionStore.state { return true }
        return false
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
}
