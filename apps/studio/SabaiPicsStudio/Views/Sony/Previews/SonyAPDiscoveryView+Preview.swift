#if DEBUG
import SwiftUI

#Preview("Sony AP Discovery") {
    NavigationView {
        SonyAPDiscoveryView()
            .environmentObject(CaptureFlowCoordinator())
    }
}
#endif
