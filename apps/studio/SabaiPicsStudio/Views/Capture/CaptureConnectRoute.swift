//  CaptureConnectRoute.swift
//  SabaiPicsStudio

import Foundation

/// Navigation routes for the Capture tab connect wizard.
enum CaptureConnectRoute: Hashable {
    case manufacturerSelection
    case sonyEntry
    case sonyNewCameraDecision
    case sonyWiFiOnboardingQR
    case sonyWiFiOnboardingManual
    case sonyDiscovery
    case error(message: String)
}
