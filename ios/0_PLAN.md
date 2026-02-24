# SabaiPics Pro - Implementation Plan

## Overview

**Goal:** iOS app for automatic camera-to-cloud photo transfer
**Approach:** USB first → Manual IP WiFi → Auto-discovery WiFi
**Timeline:** 4-5 weeks total

---

## Phase 1: USB Connection

**Duration:** Week 1
**Entitlement Required:** ❌ None

### Tasks

- [ ] 1.1 Set up Xcode project (SwiftUI, iOS 15+)
- [ ] 1.2 Integrate ImageCaptureCore framework
- [ ] 1.3 Implement ICDeviceBrowser for camera discovery
- [ ] 1.4 Build tethered capture (requestEnableTethering)
- [ ] 1.5 Implement RAW/JPEG file filtering
- [ ] 1.6 Build UI screens (Searching → Connected → Gallery → Session Complete)
- [ ] 1.7 Test with physical camera + iPhone
- [ ] 1.8 Deploy to TestFlight

### Deep Dives

- `findings/2_imagecapturecore_research.md`
- `findings/3_ui_design.md`
- `findings/4_swiftui_mapping.md`

---

## Phase 2: WiFi Manual IP

**Duration:** Week 2
**Entitlement Required:** ❌ None

### Tasks

- [ ] 2.1 Clone & integrate GPhoto2Framework
- [ ] 2.2 Build manual IP entry UI
- [ ] 2.3 Implement PTP/IP connection (port 15740)
- [ ] 2.4 Test image transfer over WiFi
- [ ] 2.5 Add camera model picker (Canon, Nikon, Sony)
- [ ] 2.6 Handle connection errors gracefully
- [ ] 2.7 Submit multicast entitlement request (parallel)

### Deep Dives

- `findings/7_implementation_strategy.md`
- `8_discovery_protocol.md` (PTP/IP section)
- `10_entitlement_form.md`

---

## Phase 3: WiFi Auto-Discovery

**Duration:** Week 3-4
**Entitlement Required:** ✅ com.apple.developer.networking.multicast

### Tasks

- [ ] 3.1 Wait for Apple entitlement approval (3-10 days)
- [ ] 3.2 Implement UPnP/SSDP discovery (UDP 239.255.255.250:1900)
- [ ] 3.3 Parse M-SEARCH responses
- [ ] 3.4 Parse XML device descriptions
- [ ] 3.5 Build auto-discovery UI (camera list)
- [ ] 3.6 Replace manual IP with seamless discovery
- [ ] 3.7 Production testing on physical devices
- [ ] 3.8 App Store submission

### Deep Dives

- `8_discovery_protocol.md`
- `9_ios_permissions.md`
- `findings/11_entitlement_tips.md`

---

## Phase 4: Enhancements (Optional)

**Duration:** Post-launch

### Tasks

- [ ] 4.1 Multi-camera support
- [ ] 4.2 Review & delete workflow
- [ ] 4.3 Settings & preferences
- [ ] 4.4 SabaiPics cloud upload integration

### Deep Dives

- `findings/5_user_journeys.md` (Journeys 6-8)

---

## Reference Index

| #   | Topic                     | File                                      |
| --- | ------------------------- | ----------------------------------------- |
| 1   | Overview                  | `1_overview.md`                           |
| 2   | ImageCaptureCore research | `findings/2_imagecapturecore_research.md` |
| 3   | UI/UX design              | `findings/3_ui_design.md`                 |
| 4   | SwiftUI mapping           | `findings/4_swiftui_mapping.md`           |
| 5   | User journeys             | `findings/5_user_journeys.md`             |
| 6   | Why PTP/IP                | `6_technical_approach.md`                 |
| 7   | Master strategy           | `findings/7_implementation_strategy.md`   |
| 8   | UPnP/SSDP protocol        | `8_discovery_protocol.md`                 |
| 9   | iOS permissions           | `9_ios_permissions.md`                    |
| 10  | Entitlement form          | `10_entitlement_form.md`                  |
| 11  | Entitlement tips          | `findings/11_entitlement_tips.md`         |
| 12  | Camera support list       | `findings/12_camera_support.md`           |
| 13  | Why Native Swift          | `13_native_vs_expo.md`                    |

---

## Dependencies

| Dependency            | Source                                | Phase |
| --------------------- | ------------------------------------- | ----- |
| ImageCaptureCore      | iOS built-in                          | 1     |
| GPhoto2Framework      | github.com/touchbyte/GPhoto2Framework | 2-3   |
| Network framework     | iOS built-in                          | 3     |
| Multicast entitlement | Apple approval                        | 3     |

---

## Hardware Requirements

- MacBook with Xcode 16+
- iPhone (iOS 15+) for testing
- USB-C to Lightning cable
- Professional camera with PTP/IP support (Canon EOS, Nikon Z, Sony Alpha, Leica M)
- Apple Developer account (free for dev, $99/yr for TestFlight/App Store)
