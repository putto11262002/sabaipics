//  CapturePipelineTypes.swift
//  FrameFast
//
//  Created: 2026-02-08
//

import Foundation

struct CaptureDetected: Sendable {
    let objectHandle: UInt32
    let filename: String
    let captureDate: Date
    let fileSize: Int
}

struct CaptureSpoolCompleted: Sendable {
    let objectHandle: UInt32
    let filename: String
    let captureDate: Date
    let fileSize: Int
    let url: URL
    let bytesWritten: Int
}

enum CapturePipelineEvent: Sendable {
    case detected(CaptureDetected)
    case rawSkipped(filename: String)
    case downloadedToSpool(CaptureSpoolCompleted)
    case error(message: String)
    case disconnected
}

protocol CaptureEventSink: Sendable {
    func handle(_ event: CapturePipelineEvent) async
}
