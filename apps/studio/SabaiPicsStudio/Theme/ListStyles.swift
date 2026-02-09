//
//  ListStyles.swift
//  SabaiPicsStudio
//

import SwiftUI

/// App-default list styling.
///
/// Design rules:
/// - Keep separators visible
/// - Do not override the system list background
/// - Use card background per-row when desired
extension View {
    func sabaiList() -> some View {
        self.listStyle(.insetGrouped)
    }

    func sabaiCardRow() -> some View {
        self
            .listRowBackground(Color.Theme.card)
            .listRowSeparator(.visible)
    }
}
