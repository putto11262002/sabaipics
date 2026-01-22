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
    @State private var lastNonCaptureTab: Tab = .events
    @State private var isPresentingCapture = false
    @State private var showEventRequiredAlert = false

    // Temporary persistence for selected event.
    // The full event selection UI will own this in the next slice.
    @AppStorage("selectedEventId") private var selectedEventId: String = ""

    var body: some View {
        TabView(selection: $selectedTab) {
            EventsHomeView()
                .tabItem {
                    Label("Events", systemImage: "calendar")
                }
                .tag(Tab.events)

            // Action tab: tapping triggers capture mode (modal), then reverts selection.
            Color.clear
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
        .onChange(of: selectedTab) { tab in
            if tab == .capture {
                selectedTab = lastNonCaptureTab
                startCapture()
            } else {
                lastNonCaptureTab = tab
            }
        }
        .fullScreenCover(isPresented: $isPresentingCapture) {
            CaptureModeView()
        }
        .alert("Select an event", isPresented: $showEventRequiredAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Choose an event before starting a capture session.")
        }
    }

    private func startCapture() {
        // Default policy: capture requires an event selection.
        guard !selectedEventId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            selectedTab = .events
            showEventRequiredAlert = true
            return
        }

        isPresentingCapture = true
    }
}
