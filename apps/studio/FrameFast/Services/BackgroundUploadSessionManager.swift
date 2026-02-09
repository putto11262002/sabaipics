//  BackgroundUploadSessionManager.swift
//  FrameFast
//
//  Background URLSession wrapper for durable file uploads.
//  Uploads survive app backgrounding and termination.
//

import Foundation

final class BackgroundUploadSessionManager: NSObject, URLSessionDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    static let sessionIdentifier = "com.sabaipics.studio.upload"

    private var session: URLSession!
    private let lock = NSLock()
    private var continuations: [Int: CheckedContinuation<HTTPURLResponse, Error>] = [:]

    /// Set by AppDelegate when the system relaunches the app for background session events.
    var systemCompletionHandler: (() -> Void)?

    private override init() {
        super.init()
    }

    static func create() -> BackgroundUploadSessionManager {
        let manager = BackgroundUploadSessionManager()

        let config = URLSessionConfiguration.background(withIdentifier: sessionIdentifier)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        config.allowsCellularAccess = true
        config.timeoutIntervalForResource = 600

        manager.session = URLSession(configuration: config, delegate: manager, delegateQueue: nil)
        return manager
    }

    func upload(request: URLRequest, fileURL: URL, taskDescription: String? = nil) async throws -> HTTPURLResponse {
        try await withCheckedThrowingContinuation { continuation in
            let task = session.uploadTask(with: request, fromFile: fileURL)
            task.taskDescription = taskDescription

            lock.lock()
            continuations[task.taskIdentifier] = continuation
            lock.unlock()

            task.resume()
        }
    }

    // MARK: - URLSessionTaskDelegate

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        let continuation = continuations.removeValue(forKey: task.taskIdentifier)
        lock.unlock()

        if let error {
            continuation?.resume(throwing: error)
        } else if let http = task.response as? HTTPURLResponse {
            continuation?.resume(returning: http)
        } else {
            continuation?.resume(throwing: UploadManagerError.badResponse)
        }

        // If continuation is nil, this is an orphan task (app was relaunched).
        // Crash recovery in UploadManager.start() handles these by resetting
        // stale `uploading` jobs to `failed` for re-processing.
    }

    // MARK: - URLSessionDelegate

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let handler = systemCompletionHandler
        systemCompletionHandler = nil
        DispatchQueue.main.async {
            handler?()
        }
    }
}
