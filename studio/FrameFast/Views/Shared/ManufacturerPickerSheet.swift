//  ManufacturerPickerSheet.swift
//  FrameFast
//
//  Bottom sheet for selecting a camera manufacturer.
//  Uses the same card style as UploadModePickerView.

import SwiftUI

struct ManufacturerPickerSheet: View {
    let onSelect: (_ manufacturer: CameraManufacturer) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                Text("Choose your camera brand to get started.")
                    .font(.subheadline)
                    .foregroundColor(Color.Theme.mutedForeground)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)

                VStack(spacing: 12) {
                    manufacturerCard(
                        icon: "camera",
                        title: "Canon",
                        description: "EOS R, 5D, 6D and other WiFi models",
                        manufacturer: .canon
                    )

                    manufacturerCard(
                        icon: "camera",
                        title: "Nikon",
                        description: "Z series and other WiFi-enabled models",
                        manufacturer: .nikon
                    )

                    manufacturerCard(
                        icon: "camera",
                        title: "Sony",
                        description: "Alpha A7, A9, and other WiFi models",
                        manufacturer: .sony
                    )
                }
                .padding(.horizontal, 20)

                Spacer()
            }
            .navigationTitle("Choose camera")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.Theme.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Card

    private func manufacturerCard(
        icon: String,
        title: String,
        description: String,
        manufacturer: CameraManufacturer
    ) -> some View {
        Button {
            dismiss()
            onSelect(manufacturer)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(Color.Theme.primary)
                    .frame(width: 36, alignment: .center)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Color.Theme.foreground)

                    Text(description)
                        .font(.caption)
                        .foregroundColor(Color.Theme.mutedForeground)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.Theme.mutedForeground)
            }
            .padding(16)
            .background(Color.Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

#if DEBUG

#Preview("Manufacturer Picker — Dark") {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            ManufacturerPickerSheet(onSelect: { _ in })
        }
        .preferredColorScheme(.dark)
}

#Preview("Manufacturer Picker — Light") {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            ManufacturerPickerSheet(onSelect: { _ in })
        }
        .preferredColorScheme(.light)
}

#endif
