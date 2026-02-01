#if DEBUG
import SwiftUI

@MainActor
private func makeScanner(
    state: NetworkScannerState,
    cameras: [DiscoveredCamera] = []
) -> NetworkScannerService {
    let scanner = NetworkScannerService()
    scanner.state = state
    scanner.discoveredCameras = cameras
    return scanner
}

private let previewCamera = DiscoveredCamera(
    name: "Sony A7 IV",
    ipAddress: "192.168.1.1",
    connectionNumber: 1,
    session: nil
)

#Preview("Sony Discovery - Scanning") {
    NavigationView {
        SonyAPDiscoveryView(
            scanner: makeScanner(state: .scanning(progress: 0.2)),
            startScanOnAppear: false
        )
        .environmentObject(CaptureFlowCoordinator())
    }
}

#Preview("Sony Discovery - Not Found") {
    NavigationView {
        SonyAPDiscoveryView(
            scanner: makeScanner(state: .completed(cameraCount: 0)),
            didTimeout: true,
            startScanOnAppear: false
        )
        .environmentObject(CaptureFlowCoordinator())
    }
}

#Preview("Sony Discovery - Error") {
    NavigationView {
        SonyAPDiscoveryView(
            scanner: makeScanner(state: .error("Connection failed")),
            startScanOnAppear: false
        )
        .environmentObject(CaptureFlowCoordinator())
    }
}

#Preview("Sony Discovery - Found") {
    NavigationView {
        SonyAPDiscoveryView(
            scanner: makeScanner(
                state: .completed(cameraCount: 1),
                cameras: [previewCamera]
            ),
            startScanOnAppear: false
        )
        .environmentObject(CaptureFlowCoordinator())
    }
}
#endif
