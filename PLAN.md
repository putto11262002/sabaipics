# Sony AP-Mode Connection Plan (iOS Studio)

Context: Sony WiFi PTP/IP cameras (e.g. ILCE-7RM4) typically run as a WiFi hotspot (AP mode). The phone connects to the camera's WiFi and talks PTP/IP locally over TCP `:15740`.

This plan focuses on making Sony AP-mode feel "just works" on repeat use, without requiring multicast/SSDP, while keeping Canon LAN discovery intact.

## Goals

- Fast repeat-connect: user turns on camera WiFi + joins it, app connects automatically.
- Offline-first transfer: capture + download works with zero internet.
- Optional real-time upload: supported via a guided "advanced" flow (user-driven), without blocking local transfer.
- Do not interleave command-channel operations: keep the single-queue invariant on the PTP/IP command socket.

## Non-goals (for the starter implementation)

- No SSDP/UPnP/multicast discovery (requires entitlement; not assumed).
- No programmatic WiFi IP configuration (iOS does not allow apps to set static IP/subnet/gateway).

## Core User Flows

### A) Default (Recommended): Transfer-only while on camera WiFi

1. User turns on Sony camera WiFi (DIRECT-xxxx).
2. User joins camera WiFi.
3. App connects to camera (no internet required).
4. Photos download and are available in-app.
5. Any cloud/API sync is queued and retried later when internet is available.

### B) Advanced: Real-time upload while on camera WiFi

1. Same steps as flow A.
2. App asks: "Do you want real-time upload while connected to the camera WiFi?"
3. If YES, app shows an interactive guide explaining the manual iOS network configuration workaround (similar to PhotoSync):
   - show current WiFi IP address + subnet mask (read-only)
   - provide copy buttons for values
   - provide "Open Settings" button
   - provide a "Test internet" button after returning to the app

Important: This is optional and must never block local capture/download.

## Technical Design

### Persisted State (repeat-connect)

Store per "camera WiFi network":

- Primary key: SSID if available (requires iOS permissions/entitlements); otherwise fall back to a "network signature".
- Network signature fallback: `(wifiIPv4 + netmask)` and/or derived `subnetBase`.

Stored values:

- `lastKnownCameraIP` (e.g. `192.168.122.1`)
- `lastConnectedAt`
- `cameraModel` and vendor markers (from `GetDeviceInfo`)
- `ptpipPort` (default `15740`)

### Discovery / Connection Algorithm (no multicast)

All probes are simple TCP connect attempts to `:15740` with short timeouts, followed by a PTP/IP handshake + `GetDeviceInfo` validation.

Ordered candidate set:

1. Cached IP (fast path)
2. Gateway-ish local candidates computed from WiFi interface IP/netmask:
   - `subnetBase + 1`
   - `subnetBase + 2`
3. Known Sony defaults:
   - `192.168.122.1`
   - optionally `192.168.1.1`, `192.168.0.1` (as fallback)
4. Optional user-triggered "Scan more" (very small sweep):
   - e.g. `subnetBase + 1..20` with very tight timeouts

Validation step (to prevent false positives):

- perform PTP/IP InitCommand
- call `GetDeviceInfo`
- confirm model/vendor contains `sony` / `ilce` / `dsc` (or matches our existing Sony detection heuristic)

### Networking and Routing

We cannot force iOS to use cellular for internet while connected to camera WiFi. Therefore:

- Transfer/capture must be offline-first.
- WAN operations must be non-blocking (queued) while on camera WiFi.
- If implementing an "online while on camera WiFi" guide, treat it as user-driven setup only.

### NEHotspotConfiguration

Use `NEHotspotConfiguration` only to streamline joining the camera SSID (when we know the SSID/password).

Limitations:

- Does not let us set static IP/subnet/gateway.
- Does not guarantee WAN routing over cellular.

### Command-channel Safety Invariant

Keep the single-queue invariant for command-socket operations:

- All command-channel send/receive transactions go through `PTPIPCommandQueue`.
- Canon `GetEvent` polling also uses the same queue to avoid interleaving.

## Rocc Audit Plan (after Sony AP-mode flow)

After the UX+discovery work is stable, do a focused audit against Rocc's Sony behavior to confirm we match the important invariants:

- Vendor events mapping (0xC201 as ObjectAdded)
- Reused in-memory handle `0xFFFFC001`
- `GetPartialObject (0x101B)` using size from `GetObjectInfo`
- Readiness gating on `objectInMemory (0xD215) >= 0x8000` via `GetAllDevicePropData (0x9209)`
- Post-SDIO handshake (`0x920D`) if required
- Event-channel keepalive Pong behavior
- Strict command-channel serialization

Any intentional deviations should be documented with rationale.

## Starter Implementation (what to do first)

1. Add an explicit "Sony AP-mode" connection screen/flow (first-run wizard):
   - Step 1: turn on camera WiFi
   - Step 2: join WiFi (with optional `NEHotspotConfiguration` when possible)
   - Step 3: connect (transfer-only by default), optional real-time upload guide

2. Implement persistence for repeat-connect:
   - store `lastKnownCameraIP` keyed by SSID (or network signature fallback)

3. Implement the candidate-IP probing algorithm (small ordered set) and validation via `GetDeviceInfo`.

4. Ensure capture/download runs offline-first:
   - avoid blocking the transfer loop on WAN calls
   - add a simple "Uploads queued" indicator (no uploads required for the starter)

5. Add lightweight in-app diagnostics:
   - show detected WiFi IPv4 + subnet mask
   - show which candidate IP succeeded
   - allow copying values for the advanced real-time upload guide
