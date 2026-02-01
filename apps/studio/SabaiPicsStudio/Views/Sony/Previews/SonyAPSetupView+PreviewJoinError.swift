#if DEBUG
import SwiftUI

#Preview("Sony QR Wizard - Join Error") {
    NavigationView {
        SonyAPSetupView(previewMode: .joiningError, previewJoinError: "Mock: Connection invalid")
    }
}
#endif
