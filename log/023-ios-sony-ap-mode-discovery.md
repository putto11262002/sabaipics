# 023 - iOS Sony AP-Mode Discovery

Date: 2026-01-31

Context

- Sony WiFi PTP/IP commonly runs as a camera-hosted hotspot (AP mode).
- The phone/iPad joins `DIRECT-*` and talks to the camera locally on TCP `15740`.
- Internet is typically unavailable on that WiFi; the transfer loop must be offline-first.

What changed

- Added a Sony-first connection flow that:
  - Guides first-time users to join the camera WiFi (AP mode)
  - Probes a small set of candidate IPs (cached + subnet base guesses + known Sony defaults)
  - Reuses the existing PTP/IP handshake logic (via `NetworkScannerService`) and auto-selects the first Sony camera found
- Added a small cache for repeat-connect:
  - Stores last-known working camera IP keyed by current WiFi network signature derived from `en0` IPv4 + netmask
  - This avoids requiring SSID access/permissions
- Added an optional "internet guide" sheet (manual user steps) explaining the PhotoSync-style workaround (Manual IP) to encourage cellular WAN while staying on camera WiFi.

Implementation notes

- The discovery probe uses a small candidate list rather than broad LAN scanning.
- Candidate list order:
  1. cached IP for current network signature
  2. `subnetBase + 1` and `subnetBase + 2`
  3. `192.168.122.1`, `192.168.1.1`, `192.168.0.1`
- Validation currently uses the camera name from the PTP/IP InitCommandAck (Sony heuristics: `sony` / `ilce` / `dsc`).
- Manual IP session creation now forces `.wifi` for the transport (avoid accidental cellular attempts).

Files

- `PLAN.md`
- `apps/studio/SabaiPicsStudio/Views/SonyAPSetupView.swift`
- `apps/studio/SabaiPicsStudio/Views/SonyAPDiscoveryView.swift`
- `apps/studio/SabaiPicsStudio/Services/WiFiNetworkInfo.swift`
- `apps/studio/SabaiPicsStudio/Services/SonyAPDiscovery.swift`
- `apps/studio/SabaiPicsStudio/Services/SonyAPConnectionCache.swift`
- `apps/studio/SabaiPicsStudio/Services/NetworkScannerService.swift` (supports explicit candidate targets)
- `apps/studio/SabaiPicsStudio/Stores/CaptureFlowCoordinator.swift`
- `apps/studio/SabaiPicsStudio/Stores/AppCoordinator.swift`
- `apps/studio/SabaiPicsStudio/ContentView.swift`

Future

- Offline-first behavior in the broader app: if camera WiFi has no internet, avoid blocking the capture/download UI on WAN requests; queue uploads.
- Optional improvement: validate via PTP `GetDeviceInfo` after handshake to reduce false positives.
- NEHotspotConfiguration (optional): streamline joining known camera SSIDs; does not support configuring static IP/subnet.

Update

- Added QR-based WiFi join:
  - Scans Sony QR payload (observed `W01:S:...;P:...;C:...;M:...;`)
  - Builds SSID `DIRECT-<S>:<C>` and joins via `NEHotspotConfiguration`
  - Adds a post-join "Network Check" step that shows WiFi IP + subnet mask and offers a skip vs real-time upload guide (PhotoSync-style Manual IP instructions)

- Added Sony entry screen:
  - Shows last saved camera (if any) and a one-tap "Connect" path
  - Offers "Set up a New Camera" to restart the QR flow

Update

- Sony entry screen now lists all saved Sony cameras (name-only rows). Tap a row to connect.
- Added swipe-to-remove for saved cameras (also attempts `removeConfiguration(forSSID:)` when SSID is known).
- Added hidden debug sheet (long-press title) to copy WiFi IP + subnet mask (not shown in normal UI).
