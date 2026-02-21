//  CircleNavButton.swift
//  FrameFast
//
//  Filled circle navigation button used across setup and guide steps.

import SwiftUI

struct CircleNavButton: View {
    enum Direction {
        case forward
        case back

        var iconName: String {
            switch self {
            case .forward: return "chevron.right"
            case .back: return "chevron.left"
            }
        }
    }

    let direction: Direction
    let disabled: Bool
    let action: () -> Void

    init(_ direction: Direction = .forward, disabled: Bool = false, action: @escaping () -> Void) {
        self.direction = direction
        self.disabled = disabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(Color(.secondarySystemGroupedBackground))
                    .frame(width: 52, height: 52)
                    .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                Image(systemName: direction.iconName)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
            }
            .opacity(disabled ? 0.4 : 1.0)
        }
        .disabled(disabled)
    }
}

#if DEBUG

#Preview("Circle Nav Buttons") {
    HStack(spacing: 20) {
        CircleNavButton(.back) {}
        CircleNavButton(.forward) {}
        CircleNavButton(.forward, disabled: true) {}
    }
}

#endif
