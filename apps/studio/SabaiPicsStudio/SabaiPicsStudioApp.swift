//
//  SabaiPicsStudioApp.swift
//  SabaiPicsStudio
//
//  Created by Put Suthisrisinlpa on 1/14/26.
//

import SwiftUI

@main
struct SabaiPicsStudioApp: App {
    @StateObject private var coordinator = AppCoordinator()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(coordinator)
                .environmentObject(coordinator.connectionStore)
                .environmentObject(coordinator.photoStore)
        }
    }
}
