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
    @EnvironmentObject private var coordinator: AppCoordinator
    @EnvironmentObject private var uploadStatusStore: UploadStatusStore

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
                    if let liveSession = captureSessionStore.captureSession {
                        CaptureStatusBarLiveView(
                            status: statusForBar,
                            cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                            downloadsCount: captureSessionStore.stats.downloadsCount,
                            lastFilename: captureSessionStore.stats.lastFilename,
                            session: liveSession,
                            stateByJobId: uploadStatusStore.stateByJobId,
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
                    } else {
                        CaptureStatusBarView(
                            status: statusForBar,
                            cameraName: captureSessionStore.activeCamera?.name ?? "Camera",
                            downloadsCount: captureSessionStore.stats.downloadsCount,
                            lastFilename: captureSessionStore.stats.lastFilename,
                            uploadedCount: 0,
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
        }
        .onAppear {
            captureSessionStore.configure(
                uploadManager: coordinator.uploadManager,
                eventIdProvider: { await MainActor.run { coordinator.selectedEventId } }
            )
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

private struct CaptureStatusBarLiveView: View {
    let status: CaptureStatusBarView.Status
    let cameraName: String
    let downloadsCount: Int
    let lastFilename: String?
    @ObservedObject var session: CaptureUISink
    let stateByJobId: [String: UploadJobState]
    let onOpen: () -> Void
    let onDisconnect: () -> Void

    var body: some View {
        CaptureStatusBarView(
            status: status,
            cameraName: cameraName,
            downloadsCount: downloadsCount,
            lastFilename: lastFilename,
            uploadedCount: uploadedCount,
            onOpen: onOpen,
            onDisconnect: onDisconnect
        )
    }

    private var uploadedCount: Int {
        // Count only this session's downloaded photos that have completed server processing.
        session.photos.reduce(into: 0) { acc, photo in
            guard case .completed = photo.status else { return }
            guard let jobId = photo.uploadJobId else { return }
            guard stateByJobId[jobId] == .completed else { return }
            acc += 1
        }
    }
}
