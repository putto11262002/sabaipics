//
//  ImagePipelineView.swift
//  FrameFast
//
//  Created: 2026-03-01
//  Full image pipeline configuration: auto-edit presets + LUT color grading
//

import SwiftUI
import UIKit

struct ImagePipelineView: View {
    let eventId: String
    let initialSettings: ImagePipelineSettings
    let onSave: (ImagePipelineSettings) -> Void

    // Form state
    @State private var autoEdit: Bool
    @State private var presetId: String?
    @State private var autoEditIntensity: Double
    @State private var lutEnabled: Bool
    @State private var lutId: String?
    @State private var lutIntensity: Double
    @State private var includeLuminance: Bool

    // Saved snapshot (updated after each successful save)
    @State private var savedSettings: ImagePipelineSettings

    // Data
    @State private var presets: [AutoEditPreset] = []
    @State private var luts: [StudioLut] = []
    @State private var isLoadingOptions = true

    // Save state
    @State private var isSaving = false
    @State private var saveError: String?

    // Validation
    @State private var validationErrors: Set<ValidationField> = []

    // Navigation
    @State private var showDiscardAlert = false
    @Environment(\.dismiss) private var dismiss

    private let repository: EventsRepository

    init(
        eventId: String,
        initialSettings: ImagePipelineSettings,
        onSave: @escaping (ImagePipelineSettings) -> Void
    ) {
        self.eventId = eventId
        self.initialSettings = initialSettings
        self.onSave = onSave

        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.repository = EventsRepository(baseURL: baseURL)

        _savedSettings = State(initialValue: initialSettings)
        _autoEdit = State(initialValue: initialSettings.autoEdit)
        _presetId = State(initialValue: initialSettings.autoEditPresetId)
        _autoEditIntensity = State(initialValue: Double(initialSettings.autoEditIntensity))
        _lutEnabled = State(initialValue: initialSettings.lutId != nil)
        _lutId = State(initialValue: initialSettings.lutId)
        _lutIntensity = State(initialValue: Double(initialSettings.lutIntensity))
        _includeLuminance = State(initialValue: initialSettings.includeLuminance)
    }

    // MARK: - Computed

    private var isDirty: Bool {
        autoEdit != savedSettings.autoEdit
            || presetId != savedSettings.autoEditPresetId
            || Int(autoEditIntensity) != savedSettings.autoEditIntensity
            || (lutEnabled ? lutId : nil) != savedSettings.lutId
            || Int(lutIntensity) != savedSettings.lutIntensity
            || includeLuminance != savedSettings.includeLuminance
    }

    private var completedLuts: [StudioLut] {
        luts.filter { $0.status == "completed" }
    }

    // MARK: - Body

    var body: some View {
        List {
            if isLoadingOptions {
                skeletonContent
                    .redacted(reason: .placeholder)
                    .disabled(true)
            } else {
                // Auto-Edit
                Section {
                    autoEditSection
                } header: {
                    Text("Auto-Edit")
                }

                // Color Grade (LUT)
                Section {
                    colorGradeSection
                } header: {
                    Text("Color Grade")
                }

                // Save error
                if let saveError {
                    Section {
                        Text(saveError)
                            .font(.subheadline)
                            .foregroundStyle(Color.red)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Color Grading & Auto-Edit")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    if isDirty {
                        showDiscardAlert = true
                    } else {
                        dismiss()
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.primary)
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Save")
                            .fontWeight(.semibold)
                    }
                }
                .disabled(!isDirty || isSaving)
            }
        }
        .alert("Unsaved Changes", isPresented: $showDiscardAlert) {
            Button("Discard", role: .destructive) {
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You have unsaved changes that will be lost.")
        }
        .task {
            await loadOptions()
        }
        .onChange(of: autoEdit) {
            validationErrors.remove(.preset)
            saveError = nil
        }
        .onChange(of: presetId) {
            validationErrors.remove(.preset)
            saveError = nil
        }
        .onChange(of: lutEnabled) {
            validationErrors.remove(.lut)
            saveError = nil
        }
        .onChange(of: lutId) {
            validationErrors.remove(.lut)
            saveError = nil
        }
    }

    // MARK: - Auto-Edit Section

    @ViewBuilder
    private var autoEditSection: some View {
        Toggle("Enable", isOn: $autoEdit)

        VStack(alignment: .leading, spacing: 4) {
            Picker("Preset", selection: $presetId) {
                Text("None").tag(String?.none)
                ForEach(presets) { preset in
                    Text(preset.isBuiltin ? "\(preset.name) (builtin)" : preset.name)
                        .tag(Optional(preset.id))
                }
            }
            .disabled(!autoEdit)

            if validationErrors.contains(.preset) {
                Text("Select a preset to enable auto-edit")
                    .font(.caption)
                    .foregroundStyle(Color.red)
            }
        }

        HStack {
            Text("Intensity")
            Slider(value: $autoEditIntensity, in: 0...100, step: 1)
            Text("\(Int(autoEditIntensity))%")
                .font(.caption)
                .foregroundStyle(Color.secondary)
                .frame(width: 40, alignment: .trailing)
        }
        .disabled(!autoEdit)
    }

    // MARK: - Color Grade Section

    @ViewBuilder
    private var colorGradeSection: some View {
        Toggle("Enable", isOn: Binding(
            get: { lutEnabled },
            set: { newValue in
                lutEnabled = newValue
                if !newValue {
                    lutId = nil
                }
            }
        ))

        VStack(alignment: .leading, spacing: 4) {
            Picker("LUT", selection: $lutId) {
                Text("None").tag(String?.none)
                ForEach(completedLuts) { lut in
                    Text(lut.name).tag(Optional(lut.id))
                }
            }
            .disabled(!lutEnabled || completedLuts.isEmpty)

            if lutEnabled && completedLuts.isEmpty {
                Text("No completed LUTs available")
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
            }

            if validationErrors.contains(.lut) {
                Text("Select a LUT to enable color grading")
                    .font(.caption)
                    .foregroundStyle(Color.red)
            }
        }

        HStack {
            Text("Intensity")
            Slider(value: $lutIntensity, in: 0...100, step: 1)
            Text("\(Int(lutIntensity))%")
                .font(.caption)
                .foregroundStyle(Color.secondary)
                .frame(width: 40, alignment: .trailing)
        }
        .disabled(!lutEnabled)

        Toggle("Include Luminance", isOn: $includeLuminance)
            .disabled(!lutEnabled)
    }

    // MARK: - Skeleton

    @ViewBuilder
    private var skeletonContent: some View {
        Section {
            Toggle("Enable", isOn: .constant(false))
            Picker("Preset", selection: .constant(String?.none)) {
                Text("None").tag(String?.none)
            }
            HStack {
                Text("Intensity")
                Slider(value: .constant(75.0), in: 0...100, step: 1)
                Text("75%")
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
                    .frame(width: 40, alignment: .trailing)
            }
        } header: {
            Text("Auto-Edit")
        }

        Section {
            Toggle("Enable", isOn: .constant(false))
            Picker("LUT", selection: .constant(String?.none)) {
                Text("None").tag(String?.none)
            }
            HStack {
                Text("Intensity")
                Slider(value: .constant(75.0), in: 0...100, step: 1)
                Text("75%")
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
                    .frame(width: 40, alignment: .trailing)
            }
            Toggle("Include Luminance", isOn: .constant(false))
        } header: {
            Text("Color Grade")
        }
    }

    // MARK: - Data Loading

    private func loadOptions() async {
        isLoadingOptions = true

        async let presetsFetch: AutoEditPresetsResponse? = {
            try? await repository.fetchAutoEditPresets()
        }()
        async let lutsFetch: StudioLutsResponse? = {
            try? await repository.fetchStudioLuts()
        }()

        let presetsResult = await presetsFetch
        let lutsResult = await lutsFetch

        presets = presetsResult?.data ?? []
        luts = lutsResult?.data ?? []
        isLoadingOptions = false
    }

    // MARK: - Validation

    private func validate() -> Bool {
        validationErrors = []

        if autoEdit && presetId == nil {
            validationErrors.insert(.preset)
        }
        if lutEnabled && lutId == nil {
            validationErrors.insert(.lut)
        }

        return validationErrors.isEmpty
    }

    // MARK: - Save

    private func save() async {
        guard validate() else { return }

        isSaving = true
        saveError = nil

        let input = UpdateImagePipelineInput(
            autoEdit: autoEdit,
            autoEditPresetId: autoEdit ? presetId : nil,
            autoEditIntensity: Int(autoEditIntensity),
            lutId: lutEnabled ? lutId : nil,
            lutIntensity: Int(lutIntensity),
            includeLuminance: includeLuminance
        )

        do {
            let result = try await repository.updateImagePipeline(eventId: eventId, input: input)
            savedSettings = result.data
            onSave(result.data)
        } catch {
            saveError = error.localizedDescription
        }

        isSaving = false
    }
}

// MARK: - Validation Field

private enum ValidationField: Hashable {
    case preset
    case lut
}

// MARK: - Previews

#Preview("1. Full Config") {
    NavigationStack {
        ImagePipelinePreviewFull()
    }
}

#Preview("2. Empty / Defaults") {
    NavigationStack {
        ImagePipelinePreviewDefaults()
    }
}

#Preview("3. Validation Errors") {
    NavigationStack {
        ImagePipelinePreviewValidation()
    }
}

// MARK: - Preview Helpers

private struct ImagePipelinePreviewFull: View {
    var body: some View {
        List {
            Section {
                Toggle("Enable", isOn: .constant(true))
                Picker("Preset", selection: .constant(Optional("preset_warm"))) {
                    Text("None").tag(String?.none)
                    Text("Neutral (builtin)").tag(Optional("preset_neutral"))
                    Text("Warm (builtin)").tag(Optional("preset_warm"))
                    Text("Cool (builtin)").tag(Optional("preset_cool"))
                    Text("Vibrant (builtin)").tag(Optional("preset_vibrant"))
                }
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(75.0), in: 0...100, step: 1)
                    Text("75%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
            } header: {
                Text("Auto-Edit")
            }

            Section {
                Toggle("Enable", isOn: .constant(true))
                Picker("LUT", selection: .constant(Optional("lut_wedding"))) {
                    Text("None").tag(String?.none)
                    Text("Wedding Look").tag(Optional("lut_wedding"))
                    Text("Film Classic").tag(Optional("lut_film"))
                }
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(60.0), in: 0...100, step: 1)
                    Text("60%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
                Toggle("Include Luminance", isOn: .constant(false))
            } header: {
                Text("Color Grade")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Color Grading & Auto-Edit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") {}
                    .fontWeight(.semibold)
                    .disabled(true)
            }
        }
    }
}

private struct ImagePipelinePreviewDefaults: View {
    var body: some View {
        List {
            Section {
                Toggle("Enable", isOn: .constant(false))
                Picker("Preset", selection: .constant(String?.none)) {
                    Text("None").tag(String?.none)
                }
                .disabled(true)
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(75.0), in: 0...100, step: 1)
                    Text("75%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .disabled(true)
            } header: {
                Text("Auto-Edit")
            }

            Section {
                Toggle("Enable", isOn: .constant(false))
                Picker("LUT", selection: .constant(String?.none)) {
                    Text("None").tag(String?.none)
                }
                .disabled(true)
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(75.0), in: 0...100, step: 1)
                    Text("75%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .disabled(true)
                Toggle("Include Luminance", isOn: .constant(false))
                    .disabled(true)
            } header: {
                Text("Color Grade")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Color Grading & Auto-Edit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") {}
                    .fontWeight(.semibold)
                    .disabled(true)
            }
        }
    }
}

private struct ImagePipelinePreviewValidation: View {
    var body: some View {
        List {
            Section {
                Toggle("Enable", isOn: .constant(true))
                Picker("Preset", selection: .constant(String?.none)) {
                    Text("None").tag(String?.none)
                    Text("Warm (builtin)").tag(Optional("preset_warm"))
                }
                Text("Select a preset to enable auto-edit")
                    .font(.caption)
                    .foregroundStyle(Color.red)
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(75.0), in: 0...100, step: 1)
                    Text("75%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
            } header: {
                Text("Auto-Edit")
            }

            Section {
                Toggle("Enable", isOn: .constant(true))
                Picker("LUT", selection: .constant(String?.none)) {
                    Text("None").tag(String?.none)
                    Text("Wedding Look").tag(Optional("lut_1"))
                }
                Text("Select a LUT to enable color grading")
                    .font(.caption)
                    .foregroundStyle(Color.red)
                HStack {
                    Text("Intensity")
                    Slider(value: .constant(75.0), in: 0...100, step: 1)
                    Text("75%")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
                Toggle("Include Luminance", isOn: .constant(false))
            } header: {
                Text("Color Grade")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Color Grading & Auto-Edit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") {}
                    .fontWeight(.semibold)
            }
        }
    }
}
