# TODO — iOS App

## Internationalization (i18n)

Target languages: English (default), Thai

### Phase 1 — Authentication & Onboarding ✓
- [x] `WelcomeView.swift` — tagline, auth buttons, legal links
- [x] `EmailEntryView.swift` — form labels, placeholders, validation
- [x] `OTPVerificationView.swift` — instructions, resend, error messages
- [x] `LoadingView.swift` — loading tagline

### Phase 2 — Main Navigation & Events ✓
- [x] `MainTabView.swift` — tab labels (Events, Capture, Profile)
- [x] `EventsHomeView.swift` — empty states, error states, upload queue cards, sync status
- [x] `EventDetailView.swift` — section headers, field labels, stat cards, buttons, edit sheet
- [x] `ImagePipelineView.swift` — settings labels, validation errors, preset names

### Phase 3 — Camera Setup & Discovery ✓
- [x] `CameraConnectFlow.swift` — manufacturer selection, navigation
- [x] `CameraDiscoveryView.swift` — discovery states, error messages, camera lists
- [x] `CanonAPSetupView.swift` — Canon-specific setup instructions
- [x] `NikonHotspotSetupView.swift` — Nikon-specific setup instructions
- [x] `SonySetupFlowView.swift` / `SonyAPEntryView.swift` — Sony QR flow, instructions

### Phase 4 — Connectivity Guide ✓
- [x] `ConnectivityGuideFlow.swift` — guide steps, navigation
- [x] `ConnectivityGuideWiFiTapStep.swift` — WiFi tap instructions
- [x] `ConnectivityGuideIPv4Step.swift` — IPv4 instructions
- [x] `ConnectivityGuideConfigureIPStep.swift` — IP config instructions
- [x] `ConnectivityGuideOnlineCheckStep.swift` — online check, success/failure
- [x] `CameraWiFiInternetGuideView.swift` — internet guide steps

### Phase 5 — Capture Flow ✓
- [x] `CaptureHomeView.swift` — camera list, empty states, disconnect
- [x] `CaptureSessionSheetView.swift` — session info labels, RAW warning
- [x] `EventPickerSheetView.swift` — event picker labels
- [x] `CaptureStatusBarView.swift` — status messages, connection states

### Phase 6 — Profile & Storage ✓
- [x] `ProfileView.swift` — section headers, menu items, sign out/delete alerts
- [x] `StorageSummaryView.swift` — storage rows, actions, retention, error fallback
- [x] `FeedbackView.swift` — form labels, placeholder, submit, success/error alerts
- [x] `CreditsToolbarView.swift` — offline/unavailable labels

### Phase 7 — Gallery ✓
- [x] `SpoolGalleryView.swift` — empty state, navigation title, photo counter

### Pluralization
- [ ] Set up plural rules in `Localizable.xcstrings` for: "photo/photos", "file/files", "camera/cameras", "RAW file(s) skipped"
