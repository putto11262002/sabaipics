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

    enum BackgroundUploadError: Error {
        case badResponse
    }

    /// Set by AppDelegate when the system relaunches the app for background session events.
    var systemCompletionHandler: (() -> Void)?

    /// Called when a background URLSession task completes but there is no awaiting continuation.
    /// This happens for "fire-and-forget" uploads and for tasks created before an app relaunch.
    var onOrphanUploadCompletion: (@Sendable (_ jobId: String, _ result: Result<HTTPURLResponse, Error>) -> Void)?

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

    func getAllTasks() async -> [URLSessionTask] {
        await withCheckedContinuation { continuation in
            session.getAllTasks { tasks in
                continuation.resume(returning: tasks)
            }
        }
    }

    func startUpload(request: URLRequest, fileURL: URL, taskDescription: String? = nil) {
        let task = session.uploadTask(with: request, fromFile: fileURL)
        task.taskDescription = taskDescription
        task.resume()
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
            if continuation == nil, let jobId = task.taskDescription {
                onOrphanUploadCompletion?(jobId, .failure(error))
            }
        } else if let http = task.response as? HTTPURLResponse {
            continuation?.resume(returning: http)
            if continuation == nil, let jobId = task.taskDescription {
                onOrphanUploadCompletion?(jobId, .success(http))
            }
        } else {
            continuation?.resume(throwing: BackgroundUploadError.badResponse)
            if continuation == nil, let jobId = task.taskDescription {
                onOrphanUploadCompletion?(jobId, .failure(BackgroundUploadError.badResponse))
            }
        }

        // If continuation is nil, this is an orphan task (app was relaunched).
        // UploadManager can reconcile completion via onOrphanUploadCompletion.
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
