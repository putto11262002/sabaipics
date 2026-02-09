//  PTPIPIO.swift
//  FrameFast
//
//  Shared NWConnection I/O helpers with deadlines.
//  Purpose: ensure PTP/IP command-channel operations cannot hang indefinitely.
//

import Foundation
import Network
import os

enum PTPIPIOError: LocalizedError {
    case timeout
    case connectionClosed
    case emptyRead

    var errorDescription: String? {
        switch self {
        case .timeout: return "Timed out waiting for camera"
        case .connectionClosed: return "Connection closed"
        case .emptyRead: return "Empty read"
        }
    }
}

enum PTPIPIO {
    static func sendWithTimeout(
        connection: NWConnection,
        data: Data,
        timeout: TimeInterval
    ) async throws {
        if Task.isCancelled {
            throw CancellationError()
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                var shouldResume = false
                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true
                }
                if shouldResume {
                    continuation.resume(throwing: PTPIPIOError.timeout)
                }
            }

            connection.send(content: data, completion: .contentProcessed { error in
                var shouldResume = false
                var resumeError: Error?
                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true
                    resumeError = error
                }
                guard shouldResume else { return }
                timeoutTask.cancel()
                if let resumeError {
                    continuation.resume(throwing: resumeError)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    static func receiveExactWithTimeout(
        connection: NWConnection,
        length: Int,
        timeout: TimeInterval
    ) async throws -> Data {
        if Task.isCancelled {
            throw CancellationError()
        }

        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            let lock = OSAllocatedUnfairLock()
            var resumed = false

            let timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                var shouldResume = false
                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true
                }
                if shouldResume {
                    continuation.resume(throwing: PTPIPIOError.timeout)
                }
            }

            connection.receive(minimumIncompleteLength: length, maximumLength: length) { content, _, isComplete, error in
                var shouldResume = false
                var resumeResult: Result<Data, Error>?

                lock.withLock {
                    guard !resumed else { return }
                    resumed = true
                    shouldResume = true

                    if let error {
                        resumeResult = .failure(error)
                    } else if isComplete {
                        resumeResult = .failure(PTPIPIOError.connectionClosed)
                    } else if let data = content, !data.isEmpty {
                        resumeResult = .success(data)
                    } else {
                        resumeResult = .failure(PTPIPIOError.emptyRead)
                    }
                }

                guard shouldResume else { return }
                timeoutTask.cancel()
                if let resumeResult {
                    switch resumeResult {
                    case .success(let data):
                        continuation.resume(returning: data)
                    case .failure(let error):
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
    }
}
