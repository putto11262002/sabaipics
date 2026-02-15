//
//  CameraManufacturer.swift
//  FrameFast
//
//  Created: 2026-01-18
//  SAB-22: Phase 1 - Manufacturer Selection
//
//  Camera manufacturer enum for manufacturer selection.
//

import Foundation

/// Camera manufacturer options
enum CameraManufacturer: String, CaseIterable, Codable {
    case canon = "Canon"
    case nikon = "Nikon"
    case sony = "Sony"

    /// Whether this manufacturer is currently supported
    var isSupported: Bool {
        switch self {
        case .canon, .nikon:
            return true
        case .sony:
            return true
        }
    }
}
