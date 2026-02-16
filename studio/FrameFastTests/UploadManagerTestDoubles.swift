import Foundation
import Testing
@testable import FrameFast

struct TestHarnessError: Error, CustomStringConvertible {
    let description: String
}

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: TimeInterval

    init(_ initial: TimeInterval) {
        self.value = initial
    }

    func now() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func set(_ newValue: TimeInterval) {
        lock.lock()
        value = newValue
        lock.unlock()
    }
}

actor FakeUploadsAPIClient: UploadsAPIClienting {
    struct Behavior: Sendable {
        var presign: @Sendable (_ input: PresignInput) throws -> UploadPresignResponse.DataPayload
        var repressign: @Sendable (_ uploadId: String) throws -> UploadPresignResponse.DataPayload
        var fetchStatus: @Sendable (_ uploadIds: [String]) throws -> [UploadStatusResponse.Item]
    }

    struct PresignInput: Sendable {
        let eventId: String
        let contentType: String
        let contentLength: Int
        let filename: String?
    }

    private var behavior: Behavior
    private(set) var presignCalls: Int = 0
    private(set) var repressignCalls: Int = 0
    private(set) var fetchStatusCalls: Int = 0

    init(behavior: Behavior) {
        self.behavior = behavior
    }

    func presign(eventId: String, contentType: String, contentLength: Int, filename: String?) async throws -> UploadPresignResponse.DataPayload {
        presignCalls += 1
        return try behavior.presign(
            PresignInput(eventId: eventId, contentType: contentType, contentLength: contentLength, filename: filename)
        )
    }

    func repressign(uploadId: String) async throws -> UploadPresignResponse.DataPayload {
        repressignCalls += 1
        return try behavior.repressign(uploadId)
    }

    func fetchStatus(uploadIds: [String]) async throws -> [UploadStatusResponse.Item] {
        fetchStatusCalls += 1
        return try behavior.fetchStatus(uploadIds)
    }
}

actor FakeConnectivityService: ConnectivityServicing {
    private let initial: ConnectivityState

    init(initial: ConnectivityState = ConnectivityState(
        status: .online,
        pathSatisfied: true,
        apiReachable: true,
        isExpensive: false,
        isConstrained: false,
        interface: .wifi
    )) {
        self.initial = initial
    }

    func snapshot() -> ConnectivityState {
        initial
    }

    func stream() -> AsyncStream<ConnectivityState> {
        AsyncStream { continuation in
            continuation.yield(initial)
            continuation.finish()
        }
    }
}

final class FakeBackgroundUploadSession: BackgroundUploadSessionManaging, @unchecked Sendable {
    private let queue = DispatchQueue(label: "FakeBackgroundUploadSession.queue")

    private var _systemCompletionHandler: (() -> Void)?
    var systemCompletionHandler: (() -> Void)? {
        get { queue.sync { _systemCompletionHandler } }
        set { queue.sync { _systemCompletionHandler = newValue } }
    }

    private var _onOrphanUploadCompletion: (@Sendable (_ jobId: String, _ result: Result<HTTPURLResponse, Error>) -> Void)?
    var onOrphanUploadCompletion: (@Sendable (_ jobId: String, _ result: Result<HTTPURLResponse, Error>) -> Void)? {
        get { queue.sync { _onOrphanUploadCompletion } }
        set { queue.sync { _onOrphanUploadCompletion = newValue } }
    }

    private var tasks: [URLSessionTask] = []
    private var _uploadCalls: Int = 0
    private var _startUploadCalls: Int = 0
    private var _uploadResponseStatusCode: Int = 200
    private var _uploadError: Error?

    var uploadCalls: Int { queue.sync { _uploadCalls } }
    var startUploadCalls: Int { queue.sync { _startUploadCalls } }
    var uploadResponseStatusCode: Int {
        get { queue.sync { _uploadResponseStatusCode } }
        set { queue.sync { _uploadResponseStatusCode = newValue } }
    }
    var uploadError: Error? {
        get { queue.sync { _uploadError } }
        set { queue.sync { _uploadError = newValue } }
    }

    func setInFlightJobIds(_ ids: [String]) {
        let newTasks = ids.map { id -> URLSessionTask in
            let t = URLSession.shared.dataTask(with: URL(string: "https://example.invalid/")!)
            t.taskDescription = id
            return t
        }
        queue.sync {
            tasks = newTasks
        }
    }

    func getAllTasks() async -> [URLSessionTask] {
        queue.sync {
            tasks
        }
    }

    func startUpload(request: URLRequest, fileURL: URL, taskDescription: String?) {
        queue.sync {
            _startUploadCalls += 1
        }
        // Fire-and-forget: no completion unless test triggers via triggerOrphanCompletion.
    }

    func upload(request: URLRequest, fileURL: URL, taskDescription: String?) async throws -> HTTPURLResponse {
        let (status, error): (Int, Error?) = queue.sync {
            _uploadCalls += 1
            return (_uploadResponseStatusCode, _uploadError)
        }

        if let error { throw error }
        return HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
    }

    func triggerOrphanCompletion(jobId: String, statusCode: Int) {
        let http = HTTPURLResponse(url: URL(string: "https://example.invalid/")!, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
        let handler = queue.sync { _onOrphanUploadCompletion }
        handler?(jobId, .success(http))
    }
}

func makeTempDirectory() throws -> URL {
    let base = FileManager.default.temporaryDirectory
    let dir = base.appendingPathComponent("framefast-tests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

func writeTempFile(dir: URL, name: String = "photo.jpg", bytes: Int = 10) throws -> URL {
    let url = dir.appendingPathComponent(name)
    let data = Data(repeating: 0xAB, count: bytes)
    try data.write(to: url)
    return url
}

func waitUntil(
    timeoutSeconds: TimeInterval = 2.0,
    pollNanoseconds: UInt64 = 20_000_000,
    _ condition: @Sendable @escaping () async throws -> Bool
) async throws {
    let deadline = Date().addingTimeInterval(timeoutSeconds)
    while Date() < deadline {
        if try await condition() { return }
        try await Task.sleep(nanoseconds: pollNanoseconds)
    }
    throw TestHarnessError(description: "Timed out waiting for condition")
}
