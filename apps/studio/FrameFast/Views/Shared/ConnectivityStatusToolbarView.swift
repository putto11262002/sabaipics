//  ConnectivityStatusToolbarView.swift
//  FrameFast

import SwiftUI

struct ConnectivityStatusToolbarView: View {
    @EnvironmentObject private var connectivityStore: ConnectivityStore

    var body: some View {
        let isOnline = connectivityStore.isOnline
        let leftText = isOnline ? "Online" : "Offline"

        let interfaceIcon = interfaceIconName(isOnline: isOnline, interface: connectivityStore.state.interface)
        let interfaceTint: Color = isOnline ? Color.Theme.success : Color.Theme.warning

        return HStack(spacing: 6) {
            Image(systemName: interfaceIcon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(interfaceTint)
            Text(leftText)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.Theme.foreground)
        }
        .accessibilityLabel(leftText)
    }

    private func interfaceIconName(isOnline: Bool, interface: ConnectivityState.Interface?) -> String {
        if !isOnline {
            return "wifi.slash"
        }
        switch interface {
        case .wifi:
            return "wifi"
        case .cellular:
            return "antenna.radiowaves.left.and.right"
        case .wiredEthernet:
            return "cable.connector"
        case .loopback:
            return "network"
        case .other:
            return "globe"
        case .none:
            return "network"
        }
    }
}
