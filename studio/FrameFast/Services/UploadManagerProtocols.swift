//  UploadManagerProtocols.swift
//  FrameFast
//
//  Small protocols to make UploadManager testable.
//

import Foundation

protocol UploadsAPIClienting: Actor {
    func presign(eventId: String, contentType: String, contentLength: Int, filename: String?) async throws -> UploadPresignResponse.DataPayload
    func repressign(uploadId: String) async throws -> UploadPresignResponse.DataPayload
    func fetchStatus(uploadIds: [String]) async throws -> [UploadStatusResponse.Item]
}

extension UploadsAPIClient: UploadsAPIClienting {}

protocol ConnectivityServicing: Actor {
    func snapshot() -> ConnectivityState
    func stream() -> AsyncStream<ConnectivityState>
}

extension ConnectivityService: ConnectivityServicing {}

protocol BackgroundUploadSessionManaging: AnyObject, Sendable {
    var systemCompletionHandler: (() -> Void)? { get set }
    var onOrphanUploadCompletion: (@Sendable (_ jobId: String, _ result: Result<HTTPURLResponse, Error>) -> Void)? { get set }

    func getAllTasks() async -> [URLSessionTask]
    func startUpload(request: URLRequest, fileURL: URL, taskDescription: String?)
    func upload(request: URLRequest, fileURL: URL, taskDescription: String?) async throws -> HTTPURLResponse
}

extension BackgroundUploadSessionManager: BackgroundUploadSessionManaging {}
