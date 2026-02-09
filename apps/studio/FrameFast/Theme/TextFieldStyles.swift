//
//  TextFieldStyles.swift
//  FrameFast
//
//  Reusable text field styles matching button design system.
//

import SwiftUI

// MARK: - Themed TextField Style

/// Standard themed text field with background and focus border
/// Matches button sizing: height 50, corner radius 12
struct ThemedTextFieldStyle: TextFieldStyle {
    @FocusState.Binding var isFocused: Bool

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.system(size: 17))
            .frame(height: 50)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.Theme.muted)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isFocused ? Color.Theme.primary : Color.clear, lineWidth: 2)
            )
    }
}

// MARK: - TextField Style Extension

extension TextFieldStyle where Self == ThemedTextFieldStyle {
    static func themed(isFocused: FocusState<Bool>.Binding) -> ThemedTextFieldStyle {
        ThemedTextFieldStyle(isFocused: isFocused)
    }
}

// MARK: - Preview

#Preview("Text Field Styles") {
    @FocusState var isFocused: Bool

    return VStack(spacing: 24) {
        // Themed text field
        TextField("Enter camera IP", text: .constant("192.168.1.1"))
            .textFieldStyle(.themed(isFocused: $isFocused))
            .focused($isFocused)

        // For comparison: Button
        Button("Connect Camera") { }
            .buttonStyle(.primary)

        Text("Text field matches button sizing:\n• Height: 50pt\n• Corner radius: 12pt\n• Font: 17pt")
            .font(.caption)
            .foregroundStyle(Color.Theme.mutedForeground)
            .multilineTextAlignment(.center)
    }
    .padding()
}
