# Sony PTP/IP Discovery Notes (ILCE-7RM4)

Context: Testing Sony ILCE-7RM4 over WiFi PTP/IP (port 15740) from iOS.

## What We Tried First ("gphoto2-like" approach) and Why It Failed

Initial implementation assumed a "storage-backed" model:

- Detect new images via standard PTP events + stable object handles
- Enumerate storage via `GetStorageIDs` / `GetStorageInfo` / `GetObjectHandles`
- Download via `GetObject`

On Sony ILCE-7RM4 in AP-mode PTP/IP:

- `GetStorageInfo(0x00010000)` and `GetObjectHandles(0x00010000, ...)` repeatedly returned `StoreNotAvailable (0x2013)`.
- Attempting "all storages" (`storageID=0x00000000`) returned `InvalidStorageID (0x2008)`.
- Sony event stream used vendor event codes (`0xC2xx`) instead of standard `0x4002 ObjectAdded`.
- The camera frequently reports the _same_ object handle for new captures: `0xFFFFC001` (in-memory object), so "dedupe by handle" breaks.

Net: the assumption "new capture appears as a new object handle in a browsable storage" is not true for this Sony PTP/IP mode.

## Sony WiFi Reality (User Experience Implications)

1. **Camera acts as an Access Point (AP) only**

- The phone must join the camera's `DIRECT-xxxx` WiFi.
- This breaks any discovery approach that assumes the phone and camera are on the same normal LAN.

2. **Auto-discovery will be harder than Canon**

- Canon LAN setups can support scanning/mDNS-like patterns.
- Sony AP mode likely requires:
  - Reading the current WiFi gateway IP / subnet and probing known PTP/IP port `15740`, or
  - A manual IP fallback.

3. **Internet while connected to camera WiFi**

- The camera AP has no internet.
- iOS can still keep internet via cellular while connected to the camera WiFi if configured.
- This matters because our app currently makes network requests that will timeout when the phone has no WAN.

## Pivot: Rocc-Inspired Sony Strategy

Rocc’s Sony PTP/IP flow succeeds because it treats Sony as "event + in-memory object" rather than "storage enumeration":

- Map Sony vendor events: `0xC201` behaves like "ObjectAdded".
- Treat `0xFFFFC001` as a fixed in-memory capture slot.
- Download via `GetPartialObject (0x101B)` using the `compressedSize` from `GetObjectInfo`.
- Serialize work to avoid overlapping camera commands (Sony emits bursts of `0xC201` and property events).

We adopted the same approach:

- Recognize Sony `0xC201` and route it through our existing "photo detected" pipeline.
- Switch Sony download to `GetPartialObject`.
- Add a queue/serialization layer for repeated `0xFFFFC001` events so we don't interleave `GetObjectInfo` requests (which caused `invalidResponse`).

## Re-check: libgphoto2 _Does_ Work (We Mis-modeled Sony)

We modified the vendored `GPhoto2Example` app to default to Sony PTP/IP and confirmed:

- It detects new images and downloads them successfully to iOS Documents.

This indicates:

- libgphoto2 is not inherently incompatible with Sony PTP/IP.
- Our first "gphoto2-like" attempt failed because we used the wrong abstraction (storage enumeration) and missed Sony-specific semantics (vendor events + in-memory handle + serialization/gating).

## Concrete Evidence (code + artifacts)

- Our Sony strategy lives in:
  - `apps/studio/SabaiPicsStudio/Services/PTPIPEventMonitor.swift` (Sony `0xC201` mapping)
  - `apps/studio/SabaiPicsStudio/Services/PTPIPPhotoDownloader.swift` (`GetPartialObject`)
  - `apps/studio/SabaiPicsStudio/Services/StandardEventSource.swift` (Sony in-memory queue + synthetic logical handles)

- libgphoto2 demo that confirms Sony download works:
  - `apps/studio/Vendor/GPhoto2Framework/GPhoto2Framework/GPhoto2Example/ViewController.m`

## Open Questions / Next Discussion Topics

- Should we keep Sony as a "special strategy" in our stack (Rocc-inspired), or integrate Rocc as the Sony engine behind our interfaces?
- How should Sony discovery work in AP mode (UX + technical approach) while keeping Canon discovery intact?
- Should we add explicit gating on Sony `objectInMemory (0xD215) >= 0x8000` (Rocc/libgphoto2) rather than only signature-based readiness?

## Sony Connection UX Plan (No SSDP Entitlement Yet)

Constraint: we do not have the iOS multicast entitlement yet, so we cannot rely on SSDP/UPnP discovery as a primary path.

### Guiding principles

- Sony is "camera is the hotspot". The app should assume AP-mode and guide the user to join the camera WiFi first.
- The transfer loop should not require internet connectivity.
- The connection path should be fast on repeat use (most users reuse the same camera).
- Manual IP must remain available as a hard escape hatch.

### Data we should persist (repeat-connect UX)

Keyed by current WiFi SSID (example: `DIRECT-xxxx:ILCE-7RM4`):

- `lastKnownCameraIP` (e.g. `192.168.122.1`)
- `lastConnectedAt`
- `cameraDisplayName` (from PTP device info/model)
- (optional) a "last successful" marker so we can avoid repeating permission preflights

This mirrors Rocc's "cache discovered device per SSID" idea, but we will store an IP now (no SSDP yet).

### Connection algorithm (no multicast)

1. **Try cached IP first**

- TCP probe `lastKnownCameraIP:15740` with a short timeout.
- If it connects, proceed directly to PTP/IP handshake.

2. **Smart fallback probe (small candidate set)**

- Read WiFi interface IPv4 + netmask (via `getifaddrs` on `en0`).
- Compute `subnetBase = ip & netmask`.
- Probe a small ordered set on port `15740` (short timeouts):
  - `subnetBase + 1` (commonly the AP/gateway)
  - `192.168.122.1` (Sony common)
  - `192.168.1.1`, `192.168.1.2` (variants seen)
  - `subnetBase + 2`

3. **Manual IP fallback**

- Prefill the input with the best guess (`subnetBase+1` or `192.168.122.1`).

### Permissions + networking behavior

- **Local Network permission**: preflight-trigger early in the Sony flow so the first connect attempt does not "mysteriously" time out.
- **No-internet camera WiFi**: during camera session, do not let backend/auth refresh tasks block transfer.
  - Show a small banner: "Camera WiFi has no internet; uploads paused".

Optional help (not required for core transfer):

- Some users want internet while connected to camera WiFi. There is a known iOS trick: set WiFi IPv4 configuration to Manual (re-enter the same IP/subnet mask) so iOS uses cellular for WAN while still connected to the camera LAN.
- This should be presented as an optional "Need internet while connected?" help accordion, not a required step.

### Sony UI flow (high level)

Sony is a different UX path than Canon because the networking assumptions differ.

1. Manufacturer selection

- User taps "Sony".

2. Sony setup screen (guided)

- Checklist: enable camera WiFi (AP mode), join `DIRECT-xxxx` network.
- Show current SSID state:
  - if on `DIRECT-*`: "Connected to camera WiFi" and enable Connect button.
  - else: show "Open WiFi Settings" shortcut + disable Connect.
- Trigger Local Network permission preflight.

3. Connect screen

- If SSID matches a cached camera:
  - show "Connect to last camera" (one-tap)
- Otherwise:
  - show "Connect" (smart probe)
- Always provide "Enter IP manually".

4. Transfer / live capture

- Use the same "TransferSession" UI as Canon once connected.
- Keep the no-internet banner if applicable.

5. Troubleshooting

- Reconnect to camera WiFi, Local Network permission, try manual IP, keep camera awake.

### Canon UI flow (high level)

Canon can stay "scan first" because it often operates on a normal LAN and supports discovery patterns.

1. Manufacturer selection

- User taps "Canon".

2. Discovery

- Scan local subnet(s), show detected cameras.
- Manual IP fallback.

3. Connect -> Transfer

- Same transfer UI.

## Future Plan (With SSDP Entitlement)

Once multicast entitlement is available, add SSDP/UPnP discovery (Rocc-style):

- Send M-SEARCH to `239.255.255.250:1900` using Sony ST.
- Parse `LOCATION:` from responses and fetch device XML.
- Cache discovered device URLs per SSID for instant reconnect.

This becomes the preferred path when available:

- Cached URL -> verify -> connect
- SSDP scan -> connect
- Manual IP fallback

## NEHotspotConfiguration (Potential)

`NEHotspotConfiguration` may help reduce friction by allowing in-app WiFi join to the camera SSID, but:

- It does not solve discovery by itself.
- User still needs SSID/password (Sony displays this on-camera).
- It is optional and should be treated as a UX enhancer.

## Decisions to Make (Explicit)

- Discovery strategy priority before entitlement: cached IP -> smart probe -> manual IP.
- Post-entitlement: SSDP (cached URL -> SSDP scan) with manual fallback.
- Whether to implement iOS "cellular while on camera WiFi" instructions as optional help.
- Whether to add `NEHotspotConfiguration` "Join camera WiFi" button.
