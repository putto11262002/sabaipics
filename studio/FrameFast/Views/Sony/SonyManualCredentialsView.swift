//  SonyManualCredentialsView.swift
//  FrameFast
//
//  Collects Sony camera WiFi credentials via manual SSID/password entry.
//

import SwiftUI

struct SonyManualCredentialsView: View {
    let onBack: () -> Void
    let onSuccess: (WiFiCredentials) -> Void

    @State private var ssid = ""
    @State private var password = ""
    @State private var error: String?

    @FocusState private var ssidFocused: Bool
    @FocusState private var passwordFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("WiFi name (SSID)")
                        .font(.subheadline)
                        .foregroundColor(Color.secondary)
                    TextField("DIRECT-...", text: $ssid)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .textFieldStyle(.roundedBorder)
                        .focused($ssidFocused)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
                        .font(.subheadline)
                        .foregroundColor(Color.secondary)
                    SecureField("Password", text: $password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .textFieldStyle(.roundedBorder)
                        .focused($passwordFocused)
                }

                if let error {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.top, 4)
                }

                Spacer(minLength: 12)

                Button("Join WiFi") {
                    ssidFocused = false
                    passwordFocused = false
                    joinWiFi()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Enter SSID")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .appBackButton {
            onBack()
        }
    }

    private func joinWiFi() {
        let trimmedSSID = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSSID.isEmpty else {
            error = "SSID is required."
            return
        }

        ssid = trimmedSSID
        password = trimmedPassword
        error = nil

        let credentials = WiFiCredentials(
            ssid: trimmedSSID,
            password: trimmedPassword.isEmpty ? nil : trimmedPassword
        )
        onSuccess(credentials)
    }
}

#if DEBUG

#Preview("Sony Manual Credentials") {
    NavigationStack {
        SonyManualCredentialsView(
            onBack: {},
            onSuccess: { _ in }
        )
    }
}

#endif
