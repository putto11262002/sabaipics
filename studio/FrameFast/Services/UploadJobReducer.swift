//  UploadJobReducer.swift
//  FrameFast
//
//  Pure decision logic for progressing a single upload job.
//  This file intentionally contains no I/O (no DB/network/files/time).
//

import Foundation

enum UploadJobEffect: Sendable, Equatable {
    case ensurePresigned
    case upload
    case checkCompletion
}

struct UploadJobReducer: Sendable {
    func effects(for job: UploadJobRecord) -> [UploadJobEffect] {
        switch job.state {
        case .queued, .failed:
            return [.ensurePresigned, .upload, .checkCompletion]
        case .presigned:
            return [.upload, .checkCompletion]
        case .uploaded, .awaitingCompletion:
            return [.checkCompletion]
        case .uploading, .completed, .terminalFailed:
            return []
        }
    }
}
