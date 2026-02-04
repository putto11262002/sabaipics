# Sony Refinement Todos

This file is the working checklist for improving the Sony camera connection flow in SabaiPics Studio.

Goal

- Keep the existing working Sony AP-mode + PTP/IP stack.
- Refactor to separate UI from side-effectful logic.
- Improve error handling and diagnostics for newer Sony models.
- Make the flow extensible for future Sony variants.

Quick context (what already works)

- Imaging Edge era (ex: A7R IV / ILCE-7RM4):
  - Scan QR (W01 payload) -> join camera-hosted `DIRECT-*` WiFi -> connect PTP/IP on TCP `15740`.
- Creators' App era coverage:
  - A7 IV (ILCE-7M4) with Access Authen Off: PTP/IP `15740` is reachable; app connection works.
  - A7 V (ILCE-7M5) on firmware 1.00: PTP/IP `15740` not exposed in observed profile; SSH/UPnP present but not useful for our stack (see log).

Artifacts / logs

- Sony AP-mode discovery + QR join feature work:
  - `log/023-ios-sony-ap-mode-discovery.md`
- ILCE-7M5 wall findings:
  - `log/sony/024-ilce-7m5-access-auth-wall.md`
- Model/app-generation research:
  - `docs/sony/01-camera-connectivity-research.md`
  - `docs/sony/02-ble-handshake-reverse-engineering.md`

Relevant code (Studio iOS app)

- QR parsing:
  - `apps/studio/SabaiPicsStudio/Services/SonyWiFiQRCode.swift`
    - Supports `W01:` payloads.
    - Note: newer payloads may put full SSID in `S:` (e.g. `S:DIRECT-...`) rather than a suffix.

- Unified Sony WiFi onboarding (QR or manual SSID -> join -> network check):
  - `apps/studio/SabaiPicsStudio/Views/Sony/SonyWiFiOnboardingView.swift`
  - Shared join status UI: `apps/studio/SabaiPicsStudio/Views/Sony/SonyWiFiJoinStatusView.swift`

- AP-mode discovery UI (candidate IP probe -> select camera):
  - `apps/studio/SabaiPicsStudio/Views/Sony/SonyAPDiscoveryView.swift`

- Discovery helpers (candidate IP list + Sony heuristics):
  - `apps/studio/SabaiPicsStudio/Services/SonyAPDiscovery.swift`

- Connection cache:
  - `apps/studio/SabaiPicsStudio/Services/SonyAPConnectionCache.swift`

- Flow orchestration:
  - `apps/studio/SabaiPicsStudio/Stores/CaptureFlowCoordinator.swift`

- Tooling helper (local experiments):
  - `scripts/sony_ssdp_probe.py`

Known pain points (why refactor)

- UI owns side effects:
  - NEHotspotConfiguration join logic, retries, timeouts, IP wait-loop, and cache writes live inside SwiftUI views.
- Code duplication:
  - `SonyAPSetupView` and `SonyAPSSIDJoinView` duplicate hotspot join + timeout + “alreadyAssociated” handling.
- Errors are mostly stringly typed:
  - Hard to map failures to actionable user guidance (e.g. “15740 closed” vs “not on WiFi” vs “local network denied”).
- Extensibility for newer models:
  - Need a clean way to detect and guide around Creators' App era constraints (Access Authen, wrong camera mode, PTP/IP not exposed).

Refinement plan (high level)

1. Extract services + protocols for side effects

- Create `WiFiJoinService` (generic):
  - `join(ssid:password:timeout:)` using `NEHotspotConfigurationManager`.
  - `waitForWiFiIPv4(timeout:)` using `WiFiNetworkInfo.currentWiFiIPv4()`.
  - Normalize “already associated” to success.
- Persist pending metadata directly via `SonyAPConnectionCache` (UserDefaults); keep it simple for now.

2. Introduce view models to separate UI from logic

- `SonyWiFiJoinViewModel`
  - Inputs: QR raw string -> parse -> join -> progress state.
  - Output state: `intro | joining(progress) | connectivityGuide(wifiInfo) | error(message, recoveryActions)`.
- `SonyAPSSIDJoinViewModel`
  - Inputs: SSID/password -> join -> network check.
- `SonyAPDiscoveryViewModel`
  - Inputs: preferred record ID / cached record / wifi info.
  - Orchestrates `NetworkScannerService` and timeout.

3. Improve diagnostics + error taxonomy

- Define typed errors and map them to actionable UI:
  - `notOnWiFi`
  - `hotspotJoinDenied`
  - `hotspotJoinTimeout`
  - `localNetworkDenied`
  - `ptpipPortClosed`
  - `cameraInWrongMode` (heuristic-driven)
  - `unknown`
- Add a “Creators' App era” help sheet:
  - Explains that some models require disabling Access Authen or using a different mode to expose PTP/IP.
  - Links/steps should be grounded in `docs/sony/01-camera-connectivity-research.md` and field logs.

4. Reduce coupling and unify user journey

- Make the Sony entry flow consistent:
  - Entry -> New camera -> (QR scan OR manual SSID) -> network check -> discovery.
- Ensure Back/Cancel always performs cleanup via `CaptureFlowCoordinator` hooks.

5. Verification

- Compile Studio app after refactor.
- Manual smoke tests:
  - A7R IV / ILCE-7RM4 QR join + connect.
  - A7 IV / ILCE-7M4 (Access Authen Off) connect.
  - Negative path: show helpful messaging when `15740` is closed (simulate via wrong WiFi).

Todo list (actionable)

- [ ] Audit current Sony views and identify duplicated code blocks (join + error handling).
- [x] Implement `WiFiJoinService` + `SonyWiFiJoinViewModel` and use them from unified onboarding.
- [x] Replace old Sony join views with `SonyWiFiOnboardingView`.
- [ ] Create view models for join flows (start with QR join) and move state machine out of views.
- [ ] Create a typed `SonyConnectionError` enum + UI mapping.
- [ ] Update discovery step to surface “15740 closed / wrong mode / Access Authen” guidance.
- [ ] Add a dev-only diagnostics view (copyable) for: WiFi IP/netmask, candidate IP list, and last scan results.
- [ ] Re-run the A7R IV and A7 IV smoke tests.

Notes

- Join verification is currently gated on WiFi IPv4 being available. This does not prove the SSID is the intended camera network (SSID reads require additional iOS APIs/permissions). If this proves insufficient, add a post-join reachability probe (e.g. camera gateway `192.168.122.1` on `:64321` or `:15740`) or evaluate SSID-based verification.
