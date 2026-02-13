//  CaptureHomeView.swift
//  FrameFast

import SwiftUI

struct CaptureHomeView: View {
    let onConnectNew: (CameraManufacturer) -> Void
    let recentCameras: [APCameraConnectionRecord]
    let onReconnect: (_ manufacturer: CameraManufacturer, _ id: UUID) -> Void
    var onRemoveRecent: (_ manufacturer: CameraManufacturer, _ id: UUID) -> Void = { _, _ in }
    var isConnectionMuted: Bool = false

    @State private var isAddCameraMenuPresented: Bool = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 8) {
                addCameraButton
                    // Match the visual width of insetGrouped list rows.
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .anchorPreference(key: AddCameraButtonBoundsPreferenceKey.self, value: .bounds) { $0 }

                List {
                    if isConnectionMuted {
                        Section {
                            Text("Disconnect the current camera to connect another.")
                                .foregroundStyle(Color.Theme.mutedForeground)
                                .sabaiCardRow()
                        }
                    }

                    Section("Recent cameras") {
                        if recentCameras.isEmpty {
                            Text("No recent cameras yet")
                                .foregroundStyle(.secondary)
                                .sabaiCardRow()
                        } else {
                            ForEach(recentCameras) { record in
                                Button {
                                    onReconnect(record.manufacturer, record.id)
                                } label: {
                                    HStack(spacing: 12) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 8) {
                                                Text(record.cameraName)
                                                    .font(.body)
                                                    .foregroundStyle(Color.Theme.foreground)

                                                ManufacturerBadge(manufacturer: record.manufacturer)
                                            }
                                        }

                                        Spacer(minLength: 0)

                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .disabled(isConnectionMuted)
                                .buttonStyle(.plain)
                                .sabaiCardRow()
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        onRemoveRecent(record.manufacturer, record.id)
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                    .tint(Color.Theme.destructive)
                                }
                            }
                        }
                    }
                }
            }
        }
        .overlayPreferenceValue(AddCameraButtonBoundsPreferenceKey.self) { anchor in
            GeometryReader { proxy in
                if let anchor, isAddCameraMenuPresented {
                    let frame = proxy[anchor]

                    Color.black
                        .opacity(0.001)
                        .ignoresSafeArea()
                        .onTapGesture {
                            isAddCameraMenuPresented = false
                        }

                    AddCameraDropdown(
                        width: max(0, frame.width - 40),
                        onSelect: { manufacturer in
                            isAddCameraMenuPresented = false
                            onConnectNew(manufacturer)
                        }
                    )
                    .offset(x: frame.minX + 20, y: frame.maxY + 8)
                    .zIndex(2)
                    .transition(
                        .asymmetric(
                            insertion: .scale(scale: 0.98, anchor: .top).combined(with: .opacity),
                            removal: .opacity
                        )
                    )
                }
            }
        }
        .animation(.snappy(duration: 0.18, extraBounce: 0.06), value: isAddCameraMenuPresented)
        .navigationTitle("Cameras")
        .navigationBarTitleDisplayMode(.large)
        .onChange(of: isConnectionMuted) { _, muted in
            if muted {
                isAddCameraMenuPresented = false
            }
        }
    }

    private var addCameraButton: some View {
        Button {
            guard !isConnectionMuted else { return }
            isAddCameraMenuPresented.toggle()
        } label: {
            Label("Add camera", systemImage: "plus")
        }
        .buttonStyle(.secondary)
        .accessibilityHint("Choose camera brand")
    }
}

private struct AddCameraDropdown: View {
    let width: CGFloat
    let onSelect: (CameraManufacturer) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(CameraManufacturer.allCases.enumerated()), id: \.element) { idx, manufacturer in
                Button {
                    onSelect(manufacturer)
                } label: {
                    HStack {
                        Text(manufacturer.rawValue)
                            .font(.body)
                            .foregroundStyle(Color.Theme.foreground)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableDropdownRowStyle())

                if idx < CameraManufacturer.allCases.count - 1 {
                    Divider()
                }
            }
        }
        .frame(width: width)
        .background(Color.Theme.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.Theme.border.opacity(0.7), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 16, x: 0, y: 10)
    }
}

private struct PressableDropdownRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.Theme.muted : Color.clear)
    }
}

private struct AddCameraButtonBoundsPreferenceKey: PreferenceKey {
    static var defaultValue: Anchor<CGRect>? = nil
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = value ?? nextValue()
    }
}

private struct ManufacturerBadge: View {
    let manufacturer: CameraManufacturer

    var body: some View {
        Text(manufacturer.rawValue)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Color.Theme.mutedForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.Theme.muted)
            .clipShape(Capsule())
    }
}

#if DEBUG

#Preview("Capture Home") {
    NavigationStack {
        CaptureHomeView(
            onConnectNew: { _ in },
            recentCameras: [],
            onReconnect: { _, _ in }
        )
    }
}

#endif
