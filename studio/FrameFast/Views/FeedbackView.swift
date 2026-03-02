//
//  FeedbackView.swift
//  FrameFast
//
//  Created: 2026-02-26
//

import SwiftUI

#if os(iOS)
import UIKit
#endif

struct FeedbackView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var content: String = ""
    @State private var category: FeedbackCategory = .general
    @State private var isSubmitting = false
    @State private var showSuccess = false
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    private let characterLimit = 5000
    private let apiClient: FeedbackAPIClient

    init() {
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? "https://api.sabaipics.com"
        self.apiClient = FeedbackAPIClient(baseURL: baseURL)
    }

    var body: some View {
        NavigationStack {
            Group {
                if showSuccess {
                    successView
                } else {
                    formView
                }
            }
            .navigationTitle("Send Feedback")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                    .disabled(isSubmitting)
                }
            }
            .alert("Submission Failed", isPresented: $showErrorAlert) {
                Button("OK", role: .cancel) {
                    errorMessage = nil
                }
            } message: {
                Text(errorMessage ?? String(localized: "An unexpected error occurred. Please try again."))
            }
        }
    }

    // MARK: - Form View

    private var formView: some View {
        Form {
            Section {
                Picker("Category", selection: $category) {
                    ForEach(FeedbackCategory.allCases, id: \.self) { cat in
                        Text(cat.displayName).tag(cat)
                    }
                }
                #if os(iOS)
                .pickerStyle(.menu)
                #else
                .pickerStyle(.inline)
                #endif
            }

            Section {
                TextEditor(text: $content)
                    .frame(minHeight: 150)
                    .font(.body)
                    .overlay(alignment: .topLeading) {
                        if content.isEmpty {
                            Text("Describe your feedback...")
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                    }
            } footer: {
                HStack {
                    Spacer()
                    Text("\(content.count)/\(characterLimit)")
                        .font(.caption)
                        .foregroundStyle(content.count > characterLimit ? .red : .secondary)
                }
            }

            Section {
                Button {
                    submitFeedback()
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Submit")
                                .fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(!canSubmit || isSubmitting)
                .listRowBackground(canSubmit ? Color.accentColor : Color.secondary.opacity(0.3))
                .foregroundStyle(.white)
            }
        }
    }

    private var canSubmit: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content.count <= characterLimit
    }

    // MARK: - Success View

    private var successView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)
                .symbolEffect(.bounce, value: showSuccess)
                .accessibilityLabel("Success")

            VStack(spacing: 8) {
                Text("Thanks for your feedback!")
                    .font(.title3.weight(.semibold))

                Text("We appreciate you taking the time to share your thoughts.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()
        }
        .onAppear {
            #if os(iOS)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            #endif
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                dismiss()
            }
        }
    }

    // MARK: - Actions

    private func submitFeedback() {
        guard canSubmit else { return }

        isSubmitting = true
        errorMessage = nil

        Task {
            do {
                _ = try await apiClient.submit(
                    content: content.trimmingCharacters(in: .whitespacesAndNewlines),
                    category: category
                )

                await MainActor.run {
                    isSubmitting = false
                    withAnimation(.spring(duration: 0.4, bounce: 0.25)) {
                        showSuccess = true
                    }
                }
            } catch {
                await MainActor.run {
                    isSubmitting = false
                    errorMessage = error.localizedDescription
                    showErrorAlert = true
                }
            }
        }
    }
}

#Preview {
    FeedbackView()
}
