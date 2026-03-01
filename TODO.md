# TODO — iOS App

## Internationalization (i18n)

Target languages: English (default), Thai

### Phase 1 — Authentication & Onboarding
- [ ] `WelcomeView.swift` — tagline, auth buttons, legal links
- [ ] `EmailEntryView.swift` — form labels, placeholders, validation
- [ ] `OTPVerificationView.swift` — instructions, resend, error messages
- [ ] `LoadingView.swift` — loading tagline

### Phase 2 — Main Navigation & Events
- [ ] `MainTabView.swift` — tab labels (Events, Capture, Profile)
- [ ] `EventsHomeView.swift` — empty states, error states, upload queue cards, sync status
- [ ] `EventDetailView.swift` — section headers, field labels, stat cards, buttons, edit sheet
- [ ] `ImagePipelineView.swift` — settings labels, validation errors, preset names

### Phase 3 — Camera Setup & Discovery
- [ ] `CameraConnectFlow.swift` — manufacturer selection, navigation
- [ ] `CameraDiscoveryView.swift` — discovery states, error messages, camera lists
- [ ] `CanonAPSetupView.swift` — Canon-specific setup instructions
- [ ] `NikonHotspotSetupView.swift` — Nikon-specific setup instructions
- [ ] `SonySetupFlowView.swift` / `SonyAPEntryView.swift` — Sony QR flow, instructions

### Phase 4 — Connectivity Guide
- [ ] `ConnectivityGuideFlow.swift` — guide steps, navigation
- [ ] `ConnectivityGuideWiFiTapStep.swift` — WiFi tap instructions
- [ ] `ConnectivityGuideIPv4Step.swift` — IPv4 instructions
- [ ] `ConnectivityGuideConfigureIPStep.swift` — IP config instructions
- [ ] `ConnectivityGuideOnlineCheckStep.swift` — online check, success/failure
- [ ] `CameraWiFiInternetGuideView.swift` — internet guide steps

### Phase 5 — Capture Flow
- [ ] `CaptureHomeView.swift` — camera list, empty states, disconnect
- [ ] `CaptureSessionSheetView.swift` — session info labels, RAW warning
- [ ] `EventPickerSheetView.swift` — event picker labels
- [ ] `CaptureStatusBarView.swift` — status messages, connection states

### Phase 6 — Profile & Storage
- [ ] `ProfileView.swift` — section headers, menu items, sign out/delete alerts
- [ ] `StorageSummaryView.swift` — storage rows, actions, retention, error fallback
- [ ] `FeedbackView.swift` — form labels, placeholder, submit, success/error alerts
- [ ] `CreditsToolbarView.swift` — offline/unavailable labels

### Phase 7 — Gallery
- [ ] `SpoolGalleryView.swift` — empty state, navigation title, photo counter

### Pluralization
- [ ] Set up plural rules in `Localizable.xcstrings` for: "photo/photos", "file/files", "camera/cameras", "RAW file(s) skipped"
