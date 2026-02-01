#if DEBUG
import SwiftUI

#Preview("Sony QR Wizard - Network Check") {
    NavigationView {
        SonyAPSetupView(
            previewMode: .networkCheck,
            previewWiFiInfo: WiFiIPv4Info(ip: 0xC0A87A17, netmask: 0xFFFFFF00)
        )
    }
}
#endif
