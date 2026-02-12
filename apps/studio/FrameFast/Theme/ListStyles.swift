//
//  ListStyles.swift
//  FrameFast
//

import SwiftUI

/// App-default list styling.
///
/// Design rules:
/// - Keep native list behavior and spacing
/// - Only override row background when needed
extension View {
    func sabaiList() -> some View {
        self
    }

    func sabaiCardRow() -> some View {
        self.listRowBackground(Color.Theme.card)
    }
}
