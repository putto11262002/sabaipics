# Canon Camera Integration - Matter Overview

## What This Is

This matter documents SabaiScale's research and implementation plan for integrating professional camera connectivity for automatic image transfer in SabaiPics Pro iOS app.

## The Goal

Build an iOS app (SabaiPics Pro) that:
- Connects to professional cameras (Canon, Nikon, Sony, Leica) via USB or WiFi
- Automatically transfers images when photos are taken
- Works seamlessly without requiring camera activation or special software
- Enables photographers to upload event photos instantly from venue

## Current Status

**Stage:** Implementation Ready - All Research Complete
**Last Updated:** 2026-01-09
**Decision:** Three-phase approach (USB → Manual IP WiFi → Auto-discovery WiFi)
**Technologies:** ImageCaptureCore (USB) + GPhoto2Framework (WiFi)

---

## 🚀 Quick Start - READ THIS FIRST

**Complete Implementation Guide:**
→ **`findings/recommended_implementation_strategy.md`** ⭐

This master document contains:
- ✅ USB → Manual IP → Auto-discovery sequence
- ✅ Week-by-week timeline (4-5 weeks total)
- ✅ Complete code examples for all phases
- ✅ Info.plist & entitlement configurations
- ✅ Testing strategy
- ✅ GPhoto2Framework integration guide

**Everything you need to start coding is in that one file.**

---

## Implementation Strategy Summary

### Phase 1: USB First (Week 1)
**No entitlement needed - Start immediately**

```swift
import ImageCaptureCore
// Discover cameras via ICDeviceBrowser
// Transfer images via USB cable (Lightning to USB-C)
// Ship working app in 1 week
```

### Phase 2: Manual IP WiFi (Week 2)
**No entitlement needed for development**

```swift
import GPhoto2Framework
// Connect to camera with manual IP entry
// Test WiFi PTP/IP communication
// Parallel: Submit entitlement request
```

### Phase 3: Auto-Discovery WiFi (Week 3-4)
**After Apple entitlement approval**

```swift
import Network
// Implement UPnP/SSDP discovery (239.255.255.250:1900)
// Automatic camera discovery and connection
// Production-ready seamless experience
```

---

## Key Technical Decisions

### Why PTP/IP Protocol (NOT Canon SDK/CCAPI)?
- ❌ Canon SDK requires per-camera activation (bad UX)
- ❌ High friction for photographers
- ✅ **PTP/IP is built into cameras** - no activation needed
- ✅ Industry standard (Lightroom, Capture One, PhotoSync use this)
- ✅ Multi-brand support (Canon, Nikon, Sony, Leica)

### Why GPhoto2Framework?
- ✅ iOS port of libgphoto2 (industry standard)
- ✅ Production-proven (used by PhotoSync app on App Store)
- ✅ PTP/IP over WiFi support
- ✅ Tested with Canon EOS cameras
- ✅ Repository: https://github.com/touchbyte/GPhoto2Framework

### Why USB First?
- ✅ Zero entitlement needed - works immediately
- ✅ Simplest to implement (ImageCaptureCore handles everything)
- ✅ Most reliable (no network issues)
- ✅ Ship working app in 1 week
- ✅ Validates concept while waiting for WiFi entitlement

### Why Native Swift (NOT Expo)?
- ✅ iOS-only focus (Android not priority)
- ✅ Easier C library integration
- ✅ Better network control (UDP multicast, TCP sockets)
- ✅ No bridge layer overhead
- ✅ 30% faster development for this use case
- 📄 Full comparison: `native-vs-expo-decision.md`

---

## Documentation Files

### 📘 Implementation & Getting Started

| File | Purpose |
|------|---------|
| **`findings/recommended_implementation_strategy.md`** | ⭐ **Master implementation guide** - Start here! |
| `overview.md` | This file - navigation and high-level summary |

### 📋 Ready to Submit

| File | Purpose |
|------|---------|
| **`apple-entitlement-request-form.md`** | Pre-filled entitlement request (submit in Week 1-2) |

### 📖 Technical Reference

| File | Purpose |
|------|---------|
| `discovery-protocol-deep-dive.md` | UPnP/SSDP protocol layer-by-layer breakdown (for Phase 3) |
| `ios-network-permissions-guide.md` | iOS permissions, entitlements, Info.plist setup (for Phase 3) |
| `technical-approach.md` | PTP/IP protocol decision rationale |

### 🔬 Research & Analysis

| File | Purpose |
|------|---------|
| `findings/imagecapturecore_wifi_discovery_research.md` | Why ImageCaptureCore can't auto-discover WiFi cameras |
| `findings/ptpip_camera_support_research.md` | 90+ camera models supporting WiFi PTP/IP |
| `findings/entitlment_request_best_practices.md` | How to get Apple approval (3-10 days strategies) |
| `native-vs-expo-decision.md` | Why Native Swift vs Expo for this project |

### 📚 Historical Reference

| File | Purpose |
|------|---------|
| `application-data-requirements.md` | Canon SDK requirements (reference only - decided not to use) |

---

## Camera Compatibility

### ✅ USB Support (via ImageCaptureCore)
All PTP-compatible cameras:
- Canon EOS series (R, RP, M, DSLR)
- Nikon Z-mount, D-series
- Sony Alpha series
- Leica M series
- And more... (gPhoto2 database: 2,979+ cameras)

### ✅ WiFi Support (via GPhoto2Framework + PTP/IP)
90+ camera models including:
- **Canon:** EOS R5/R6/R7/R8, EOS RP, 5D Mark IV, 6D, 70D, M3/M5/M6
- **Nikon:** Z9/Z7/Z6/Z5, D850/D750/D780, D5/D6
- **Sony:** Alpha 1/7/7R/7S series, A9/A9II
- **Leica:** M10/M11/M-E

📄 Full list: `findings/ptpip_camera_support_research.md`

---

## Timeline

```
Week 1:
├─ USB implementation (ImageCaptureCore)
├─ Submit entitlement request
└─ Ship USB beta to TestFlight

Week 2:
├─ Manual IP WiFi (GPhoto2Framework)
└─ Wait for entitlement approval (2-4 weeks)

Week 3-4:
├─ UPnP/SSDP auto-discovery (after approval)
└─ Ship production version to App Store

Total: 4-5 weeks to full production app
```

---

## Key Resources

### Libraries
- **GPhoto2Framework:** https://github.com/touchbyte/GPhoto2Framework
  - iOS port of libgphoto2
  - Used by PhotoSync (production app on App Store)
  - PTP/IP over WiFi support

- **libgphoto2:** http://www.gphoto.org/doc/
  - Industry standard camera communication library
  - 2,979+ camera database

### Protocol Documentation
- **PTP/IP Protocol Guide:** [Pairing and Initializing a PTP/IP Connection](https://julianschroden.com/post/2023-05-10-pairing-and-initializing-a-ptp-ip-connection-with-a-canon-eos-camera/)
- **ISO 15740:** PTP/IP specification standard

### Apple Resources
- **Multicast Entitlement Request:** https://developer.apple.com/contact/request/networking-multicast
- **ImageCaptureCore Documentation:** https://developer.apple.com/documentation/imagecapturecore

---

## Product Context

**App:** SabaiPics Pro (iOS)
**Target Users:** Professional event photographers in Thailand
**Use Case:** Upload event photos from camera to cloud instantly at venue
**Problem Solved:** Eliminate 1-3 day delay from SD card workflow
**Value:** Photos available to participants within minutes of event

**Parent Product:** SabaiPics - event photo distribution platform with AI face recognition
📄 See: `@products/sabaipics/`

---

## Next Actions

1. ✅ **Read:** `findings/recommended_implementation_strategy.md`
2. ✅ **Clone:** https://github.com/touchbyte/GPhoto2Framework
3. ✅ **Submit:** Entitlement request (use `apple-entitlement-request-form.md`)
4. ✅ **Build:** USB implementation (Week 1)
5. ✅ **Test:** With real Canon/Nikon cameras
6. ✅ **Ship:** USB beta to TestFlight

**You have everything you need to start coding today.** 🚀
