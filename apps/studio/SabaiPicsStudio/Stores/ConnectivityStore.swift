//
//  ConnectivityStore.swift
//  SabaiPicsStudio
//

import Foundation

@MainActor
final class ConnectivityStore: ObservableObject {
    @Published private(set) var state: ConnectivityState = ConnectivityState(
        isOnline: true,
        isExpensive: false,
        isConstrained: false,
        interface: nil
    )

    var isOnline: Bool { state.isOnline }

    private let service: ConnectivityService
    private var task: Task<Void, Never>?

    init(service: ConnectivityService) {
        self.service = service
    }

    func start() {
        guard task == nil else { return }
        task = Task.detached { [weak self, service] in
            let stream = await service.stream()
            for await next in stream {
                await MainActor.run {
                    self?.state = next
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
