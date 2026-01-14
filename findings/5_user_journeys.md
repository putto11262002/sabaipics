# SabaiPics Pro - Complete User Journeys Summary

**Last Updated:** 2026-01-09
**Purpose:** All possible user flows and edge cases

---

## Overview

SabaiPics Pro has **4 main user journeys** based on different scenarios:

1. **Happy Path** - Everything works perfectly (USB connection)
2. **WiFi Manual IP** - Using WiFi with manual camera IP entry (development/fallback)
3. **WiFi Auto-Discovery** - Using WiFi with automatic camera detection (production)
4. **Error Recovery** - Handling disconnections and failures

---

## Journey 1: Happy Path (USB Connection)

**User:** Professional photographer at wedding venue
**Equipment:** Canon EOS R5 + iPhone + USB-C to Lightning cable
**Goal:** Upload photos to SabaiPics in real-time during event

### Flow Diagram

```
┌─────────────────────┐
│   Launch App        │
│   [App Icon]        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Searching View     │
│  🔍 Looking for     │
│     cameras...      │
│                     │
│  • Connect USB      │
│  • Enable WiFi      │
└──────────┬──────────┘
           ↓
    (Plug in USB cable)
           ↓
┌─────────────────────┐
│  Camera Found       │
│  📷 Canon EOS R5    │
│  USB Connected      │
│                     │
│  [Connect Camera]   │ ← Tap
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connecting...      │
│  ⏳ Opening session │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Ready to Shoot     │
│  📸 Ready for       │
│     capture         │
│                     │
│  0 photos captured  │
│                     │
│  "Take photos with  │
│   camera shutter"   │
└──────────┬──────────┘
           ↓
   (Photographer shoots)
     *click* shutter
           ↓
┌─────────────────────┐
│  Live Capture       │
│  📸 1  💾 0  ⬇️ 1   │
│                     │
│  ┌─────┐            │
│  │ IMG │ ← New!     │
│  │ 001 │            │
│  │ ⬇️  │            │
│  └─────┘            │
└──────────┬──────────┘
           ↓
    (2 seconds later)
           ↓
┌─────────────────────┐
│  Live Capture       │
│  📸 1  💾 1  ⬇️ 0   │
│                     │
│  ┌─────┐            │
│  │ IMG │            │
│  │ 001 │            │
│  │ ✅  │ ← Saved!   │
│  └─────┘            │
└──────────┬──────────┘
           ↓
   (Continue shooting)
     *click* *click*
           ↓
┌─────────────────────┐
│  Live Capture       │
│  📸 45  💾 43 ⬇️ 2  │
│                     │
│  ┌───┬───┬───┐      │
│  │IMG│IMG│IMG│      │
│  │045│044│043│      │
│  │⬇️ │⬇️ │✅ │      │
│  ├───┼───┼───┤      │
│  │IMG│IMG│IMG│      │
│  │✅ │✅ │✅ │      │
│  └───┴───┴───┘      │
└──────────┬──────────┘
           ↓
   (Event finished)
   Tap [End Session]
           ↓
┌─────────────────────┐
│  Session Complete   │
│  ✅ 145 photos      │
│  💾 145 saved       │
│  6.2 GB • 2h 34m    │
│                     │
│  [View Photos]      │
│  [Upload to Cloud]  │
│  [New Session]      │
└─────────────────────┘
           ↓
   Tap [Upload to Cloud]
           ↓
┌─────────────────────┐
│  Uploading...       │
│  ☁️ 45/145 (31%)    │
│                     │
│  [Progress Bar]     │
│  ────────────       │
│                     │
│  Uploading IMG_045  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Upload Complete    │
│  ✅ 145 photos      │
│     uploaded        │
│                     │
│  Available in       │
│  SabaiPics gallery  │
│                     │
│  [Done]             │
└─────────────────────┘
```

### Step-by-Step Actions

| Step | User Action | App Response | Time |
|------|------------|--------------|------|
| 1 | Open app | Shows "Looking for cameras..." | 0s |
| 2 | Plug in USB cable | Camera detected, shows details | 1-2s |
| 3 | Tap "Connect Camera" | Opens session, enables tethering | 2-3s |
| 4 | See "Ready to Shoot" | Waiting for first photo | - |
| 5 | Take photo with camera | New thumbnail appears (downloading) | <1s |
| 6 | Wait | Download completes, shows ✅ | 2-5s |
| 7 | Continue shooting | Grid fills with photos automatically | - |
| 8 | Tap "End Session" | Shows session summary | 0s |
| 9 | Tap "Upload to Cloud" | Uploads all photos to SabaiPics | 5-30min |
| 10 | Done | Photos available in galleries | - |

### Timeline

```
00:00 - Launch app
00:02 - Connect camera (USB cable)
00:05 - First photo captured
00:07 - First photo downloaded & saved
...
02:34 - Event ends (145 photos)
02:35 - Upload to cloud starts
02:45 - Upload complete (145 photos)
```

**Total: ~2h 45m** (2h 34m shooting + 10m upload)

---

## Journey 2: WiFi Manual IP Flow

**User:** Photographer testing during development
**Equipment:** Canon EOS R5 (WiFi enabled) + iPhone
**Goal:** Test WiFi connection before auto-discovery is ready
**Context:** No multicast entitlement yet

### Flow Diagram

```
┌─────────────────────┐
│   Launch App        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connection Mode    │
│                     │
│  [USB Connection]   │
│                     │
│  [WiFi Connection]  │ ← Tap
│  (Manual IP)        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  WiFi Setup         │
│                     │
│  Step 1: Enable     │
│  "Connect to        │
│  Smartphone" on     │
│  camera             │
│                     │
│  Step 2: Join       │
│  camera WiFi        │
│  network            │
│                     │
│  [Next]             │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Manual IP Entry    │
│                     │
│  Camera IP:         │
│  ┌───────────────┐  │
│  │192.168.1.100  │  │ ← Type
│  └───────────────┘  │
│                     │
│  Camera Model:      │
│  ┌───────────────┐  │
│  │ Canon EOS R5  │  │ ← Select
│  └───────────────┘  │
│                     │
│  [Connect]          │ ← Tap
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connecting...      │
│  Testing connection │
│  to 192.168.1.100   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connected!         │
│  📷 Canon EOS R5    │
│  WiFi (Manual IP)   │
│                     │
│  [Start Session]    │
└──────────┬──────────┘
           ↓
   (Same as USB flow)
   Ready → Capture → End
```

### Setup Instructions Shown to User

```
┌─────────────────────────────────────┐
│  WiFi Camera Setup                  │
│                                     │
│  On your camera:                    │
│  ───────────────────────────────    │
│                                     │
│  1. Press MENU button               │
│                                     │
│  2. Navigate to WiFi settings       │
│                                     │
│  3. Select "Connect to Smartphone"  │
│                                     │
│  4. Enable WiFi and note the        │
│     network name (SSID)             │
│                                     │
│  On your iPhone:                    │
│  ───────────────────────────────    │
│                                     │
│  1. Open Settings → WiFi            │
│                                     │
│  2. Connect to camera WiFi network  │
│     (e.g., "Canon_123456")          │
│                                     │
│  3. Return to this app              │
│                                     │
│  4. Enter camera IP address         │
│     (Usually 192.168.1.1 or         │
│      shown on camera screen)        │
│                                     │
│  [I've Done This]                   │
└─────────────────────────────────────┘
```

### Common IP Addresses by Brand

```
┌─────────────────────────────────────┐
│  Common Camera IPs                  │
│                                     │
│  Canon:     192.168.1.1             │
│  Nikon:     192.168.1.1             │
│  Sony:      192.168.122.1           │
│  Fujifilm:  192.168.0.1             │
│                                     │
│  Custom IP: ┌──────────────┐        │
│             │              │        │
│             └──────────────┘        │
│                                     │
│  [Test Connection]                  │
└─────────────────────────────────────┘
```

---

## Journey 3: WiFi Auto-Discovery Flow

**User:** Photographer at live event (production)
**Equipment:** Canon EOS R5 (WiFi) + iPhone
**Goal:** Wireless photo upload without cables
**Context:** Multicast entitlement approved

### Flow Diagram

```
┌─────────────────────┐
│   Launch App        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connection Mode    │
│                     │
│  [USB Connection]   │
│                     │
│  [WiFi Connection]  │ ← Tap
│  (Auto-discover)    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  WiFi Setup         │
│                     │
│  1. Enable "Connect │
│     to Smartphone"  │
│     on camera       │
│                     │
│  2. Join camera     │
│     WiFi network    │
│                     │
│  [I'm Connected]    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Discovering...     │
│  🔍 Searching for   │
│     cameras on      │
│     network...      │
│                     │
│  Using UPnP/SSDP    │
└──────────┬──────────┘
           ↓
    (2-5 seconds)
           ↓
┌─────────────────────┐
│  Cameras Found      │
│                     │
│  ┌───────────────┐  │
│  │ 📷 Canon R5   │  │ ← Select
│  │ 192.168.1.1   │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 📷 Nikon Z9   │  │
│  │ 192.168.1.2   │  │
│  └───────────────┘  │
│                     │
│  [Refresh]          │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Connected!         │
│  📷 Canon EOS R5    │
│  WiFi (Auto)        │
│  192.168.1.1        │
│                     │
│  [Start Session]    │
└──────────┬──────────┘
           ↓
   (Same as USB flow)
   Ready → Capture → End
```

### Discovery States

```
State 1: Permission Request
┌─────────────────────────────────────┐
│  Local Network Permission           │
│                                     │
│  "SabaiPics Pro" would like to      │
│  find and connect to devices on     │
│  your local network.                │
│                                     │
│  This app needs to discover cameras │
│  on your local network to           │
│  automatically transfer photos.     │
│                                     │
│  [Don't Allow]    [OK]              │
└─────────────────────────────────────┘

State 2: Searching
┌─────────────────────────────────────┐
│  Discovering Cameras                │
│                                     │
│  [Animation: Radar pulse]           │
│                                     │
│  Searching network...               │
│                                     │
│  This may take 5-10 seconds         │
└─────────────────────────────────────┘

State 3: Found Multiple
┌─────────────────────────────────────┐
│  Select Camera                      │
│                                     │
│  Found 2 cameras:                   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 📷 Canon EOS R5             │   │
│  │ IP: 192.168.1.1             │   │
│  │ Serial: 123456              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 📷 Nikon Z9                 │   │
│  │ IP: 192.168.1.2             │   │
│  │ Serial: 789012              │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Refresh Search]                   │
└─────────────────────────────────────┘

State 4: None Found
┌─────────────────────────────────────┐
│  No Cameras Found                   │
│                                     │
│  ❌ No cameras detected             │
│                                     │
│  Troubleshooting:                   │
│  • Check camera WiFi is enabled     │
│  • iPhone connected to camera WiFi  │
│  • Camera in "Connect to Phone" mode│
│                                     │
│  [Try Again]                        │
│  [Enter IP Manually]                │
└─────────────────────────────────────┘
```

---

## Journey 4: Error Recovery Flows

### 4A: USB Cable Disconnected During Session

```
┌─────────────────────┐
│  Live Capture       │
│  📸 45  💾 43       │
│  (Shooting...)      │
└──────────┬──────────┘
           ↓
   (Cable unplugged!)
           ↓
┌─────────────────────┐
│  ⚠️ Connection Lost │
│                     │
│  Camera disconnected│
│                     │
│  43 photos saved    │
│  2 photos lost      │
│                     │
│  [Reconnect]        │
│  [End Session]      │
└──────────┬──────────┘
           ↓
   User plugs cable back
           ↓
┌─────────────────────┐
│  Reconnecting...    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  ✅ Reconnected     │
│                     │
│  Session resumed    │
│  Ready to continue  │
│                     │
│  [Continue]         │
└──────────┬──────────┘
           ↓
   (Back to Live Capture)
```

### 4B: WiFi Network Dropped

```
┌─────────────────────┐
│  Live Capture       │
│  (WiFi)             │
└──────────┬──────────┘
           ↓
   (WiFi disconnected)
           ↓
┌─────────────────────┐
│  ⚠️ WiFi Lost       │
│                     │
│  Network connection │
│  interrupted        │
│                     │
│  Last saved:        │
│  IMG_042 (12:34)    │
│                     │
│  Troubleshooting:   │
│  • Check iPhone WiFi│
│  • Move closer to   │
│    camera           │
│                     │
│  [Reconnect]        │
│  [Switch to USB]    │
│  [End Session]      │
└─────────────────────┘
```

### 4C: Download Failed

```
┌─────────────────────┐
│  Live Capture       │
│  📸 10  💾 8  ❌ 2  │ ← 2 errors
│                     │
│  ┌───┬───┬───┐      │
│  │IMG│IMG│IMG│      │
│  │010│009│008│      │
│  │⬇️ │❌ │✅ │      │
│  └───┴───┴───┘      │
│                     │
│  ⚠️ 2 downloads     │
│     failed          │
│                     │
│  [Retry Failed]     │
└──────────┬──────────┘
           ↓
   Tap [Retry Failed]
           ↓
┌─────────────────────┐
│  Retrying...        │
│  ⬇️ 2 photos        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  ✅ Retry Successful│
│  All photos saved   │
└─────────────────────┘
```

### 4D: Storage Full

```
┌─────────────────────┐
│  Live Capture       │
│  📸 100  💾 99      │
└──────────┬──────────┘
           ↓
   (New photo captured)
           ↓
┌─────────────────────┐
│  ⚠️ Storage Full    │
│                     │
│  iPhone storage is  │
│  full. Cannot save  │
│  more photos.       │
│                     │
│  Available: 12 MB   │
│  Needed: 45 MB      │
│                     │
│  Options:           │
│  • Delete old photos│
│  • Upload to cloud  │
│    (frees space)    │
│  • End session      │
│                     │
│  [Upload Now]       │
│  [Manage Storage]   │
│  [End Session]      │
└─────────────────────┘
```

### 4E: Permission Denied (Local Network)

```
┌─────────────────────┐
│  WiFi Discovery     │
│  (Tries to scan)    │
└──────────┬──────────┘
           ↓
   User tapped "Don't Allow"
           ↓
┌─────────────────────┐
│  ⚠️ Permission      │
│     Required        │
│                     │
│  Local network      │
│  access is required │
│  to discover cameras│
│                     │
│  Please enable in:  │
│  Settings → Privacy │
│  → Local Network    │
│  → SabaiPics Pro    │
│                     │
│  [Open Settings]    │
│  [Use Manual IP]    │
│  [Use USB Instead]  │
└─────────────────────┘
```

### 4F: Camera Not Supported

```
┌─────────────────────┐
│  Camera Found       │
│  📷 Olympus E-M1    │
└──────────┬──────────┘
           ↓
   Tap [Connect]
           ↓
┌─────────────────────┐
│  ⚠️ Not Supported   │
│                     │
│  Olympus E-M1 uses  │
│  a proprietary      │
│  protocol not       │
│  supported by this  │
│  app.               │
│                     │
│  Supported brands:  │
│  • Canon            │
│  • Nikon            │
│  • Sony             │
│  • Leica            │
│                     │
│  [View Compatible   │
│   Cameras]          │
│  [Try Anyway]       │
└─────────────────────┘
```

---

## Journey 5: First-Time User Onboarding

**User:** Photographer using app for first time
**Goal:** Understand how to use the app

```
┌─────────────────────┐
│   First Launch      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Welcome!           │
│                     │
│  SabaiPics Pro      │
│                     │
│  Upload event photos│
│  in real-time       │
│                     │
│  [Get Started]      │
│  [Skip Tutorial]    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Tutorial (1/3)     │
│                     │
│  [Image: Camera]    │
│                     │
│  Connect Your       │
│  Camera             │
│                     │
│  USB or WiFi        │
│  supported          │
│                     │
│  ○ ● ○              │
│  [Next]             │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Tutorial (2/3)     │
│                     │
│  [Image: Photos]    │
│                     │
│  Automatic          │
│  Download           │
│                     │
│  Photos appear as   │
│  you shoot          │
│                     │
│  ○ ○ ●              │
│  [Next]             │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Tutorial (3/3)     │
│                     │
│  [Image: Cloud]     │
│                     │
│  Upload to          │
│  SabaiPics          │
│                     │
│  Share with event   │
│  participants       │
│                     │
│  ○ ○ ○              │
│  [Start Using App]  │
└──────────┬──────────┘
           ↓
   (Main app flow)
```

---

## Journey 6: Multi-Camera Workflow

**User:** Wedding photographer with 2 cameras
**Equipment:** Canon R5 (main) + Canon R6 (backup)
**Goal:** Download from both cameras

```
┌─────────────────────┐
│  Launch App         │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Cameras Found      │
│                     │
│  ┌───────────────┐  │
│  │ 📷 Canon R5   │  │
│  │ USB Connected │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 📷 Canon R6   │  │
│  │ WiFi          │  │
│  └───────────────┘  │
│                     │
│  [Connect Both]     │
│  [Select One]       │
└──────────┬──────────┘
           ↓
   Tap [Connect Both]
           ↓
┌─────────────────────┐
│  Multi-Camera Mode  │
│                     │
│  📷 R5 (USB)        │
│  📸 45  💾 43       │
│                     │
│  📷 R6 (WiFi)       │
│  📸 23  💾 22       │
│                     │
│  Total: 68 photos   │
│                     │
│  [Switch View]      │
│  ┌─────┬─────┬─────┐│
│  │ R5  │ R5  │ R6  ││ ← Mixed
│  │ IMG │ IMG │ IMG ││
│  │ 045 │ 044 │ 023 ││
│  └─────┴─────┴─────┘│
└─────────────────────┘
```

---

## Journey 7: Review & Delete Flow

**User:** Photographer reviewing photos before upload
**Goal:** Delete bad shots, keep only good ones

```
┌─────────────────────┐
│  Session Complete   │
│  145 photos         │
│  [View Photos]      │ ← Tap
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  All Photos         │
│                     │
│  [Grid] [List]      │ ← View modes
│                     │
│  ┌───┬───┬───┐      │
│  │IMG│IMG│IMG│      │
│  │145│144│143│      │
│  └───┴───┴───┘      │
│  ┌───┬───┬───┐      │
│  │IMG│IMG│IMG│      │
│  │142│141│140│      │
│  └───┴───┴───┘      │
│                     │
│  [Select]           │
│  [Upload All]       │
└──────────┬──────────┘
           ↓
   Tap [Select]
           ↓
┌─────────────────────┐
│  Select Photos      │
│                     │
│  [Cancel] [Delete]  │
│                     │
│  ┌───┬───┬───┐      │
│  │☑️ │   │☑️ │      │ ← Tap to select
│  │IMG│IMG│IMG│      │
│  │145│144│143│      │
│  └───┴───┴───┘      │
│                     │
│  3 selected         │
└──────────┬──────────┘
           ↓
   Tap [Delete]
           ↓
┌─────────────────────┐
│  Confirm Delete     │
│                     │
│  Delete 3 photos?   │
│                     │
│  This cannot be     │
│  undone.            │
│                     │
│  [Cancel] [Delete]  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  All Photos         │
│  142 photos         │ ← Updated
│                     │
│  3 photos deleted   │
│                     │
│  [Upload All]       │
└─────────────────────┘
```

---

## Journey 8: Settings & Preferences

**User:** Photographer customizing app behavior

```
┌─────────────────────┐
│  Main Screen        │
│  [⚙️ Settings]      │ ← Tap
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Settings           │
│                     │
│  Download Options   │
│  ─────────────────  │
│  File Types:        │
│  ☑️ RAW files       │
│  ☑️ JPEG files      │
│  ☐ Video files      │
│                     │
│  Quality:           │
│  ○ Original         │
│  ○ High             │
│  ○ Medium           │
│                     │
│  Upload Options     │
│  ─────────────────  │
│  Auto-upload:       │
│  [Toggle: OFF]      │
│                     │
│  Upload on WiFi:    │
│  [Toggle: ON]       │
│                     │
│  Storage            │
│  ─────────────────  │
│  Delete after upload│
│  [Toggle: OFF]      │
│                     │
│  Cache size:        │
│  2.3 GB             │
│  [Clear Cache]      │
│                     │
│  Camera Settings    │
│  ─────────────────  │
│  Preferred:         │
│  [USB] [WiFi]       │
│                     │
│  About              │
│  ─────────────────  │
│  Version: 1.0.0     │
│  [Help]             │
│  [Send Feedback]    │
└─────────────────────┘
```

---

## All User Journeys Summary Table

| Journey | Trigger | Duration | Complexity | Frequency |
|---------|---------|----------|------------|-----------|
| **1. Happy Path (USB)** | Normal event shoot | 2-3 hours | Low | Very High (90%) |
| **2. WiFi Manual IP** | Development/testing | 5 minutes | Medium | Low (5%) |
| **3. WiFi Auto-Discovery** | Production WiFi use | 2-3 hours | Low | Medium (20%) |
| **4A. USB Disconnected** | Accidental unplug | 30 seconds | Low | Low (5%) |
| **4B. WiFi Dropped** | Network issues | 1 minute | Medium | Low (10%) |
| **4C. Download Failed** | Network/storage | 30 seconds | Low | Low (5%) |
| **4D. Storage Full** | Long event | 2 minutes | Medium | Low (3%) |
| **4E. Permission Denied** | First WiFi use | 1 minute | Low | Low (2%) |
| **4F. Unsupported Camera** | Wrong camera | 10 seconds | Low | Very Low (1%) |
| **5. First-Time Onboarding** | First launch | 2 minutes | Low | Once |
| **6. Multi-Camera** | Pro photographer | 3-4 hours | High | Low (10%) |
| **7. Review & Delete** | After session | 10 minutes | Low | Medium (30%) |
| **8. Settings** | Customization | 2 minutes | Low | Low (10%) |

---

## Key User Flow Insights

### Critical Paths (Must Work Perfectly)

1. **USB Connection** (Journey 1)
   - Most common use case (90%)
   - Must be rock-solid reliable
   - Fast photo download essential

2. **Error Recovery** (Journey 4A-C)
   - Users WILL disconnect cables accidentally
   - Network WILL drop occasionally
   - Must gracefully handle and recover

3. **First-Time Experience** (Journey 5)
   - First impression critical
   - Clear instructions needed
   - Quick success important

### Optional Paths (Nice to Have)

1. **WiFi Auto-Discovery** (Journey 3)
   - Depends on entitlement approval
   - Fallback to manual IP works

2. **Multi-Camera** (Journey 6)
   - Advanced feature
   - Small user segment
   - Can add later

3. **Review & Delete** (Journey 7)
   - Useful but not essential
   - Can do later on computer

---

## State Machine Summary

```
States:
┌──────────────┐
│  Searching   │ ← Initial state
└──────┬───────┘
       ↓
┌──────────────┐
│  Found       │
└──────┬───────┘
       ↓
┌──────────────┐
│  Connecting  │
└──────┬───────┘
       ↓
┌──────────────┐
│  Ready       │
└──────┬───────┘
       ↓
┌──────────────┐
│  Capturing   │ ← Main state
└──────┬───────┘
       ↓
┌──────────────┐
│  Complete    │
└──────────────┘

Error States (from any):
- Disconnected
- Permission Denied
- Storage Full
- Download Failed
```

---

## Next Steps for Implementation

### Phase 1 (Week 1): Core Flows
- Journey 1: Happy Path (USB)
- Journey 4A: USB Disconnected

### Phase 2 (Week 2): WiFi Development
- Journey 2: WiFi Manual IP
- Journey 4B: WiFi Dropped

### Phase 3 (Week 3-4): Production Features
- Journey 3: WiFi Auto-Discovery
- Journey 5: First-Time Onboarding
- Journey 7: Review & Delete

### Phase 4 (Later): Advanced
- Journey 6: Multi-Camera
- Journey 8: Settings
- Journey 4D-F: Edge cases

---

## Complete User Journey Coverage

✅ **All scenarios covered:**
- Normal operation (USB, WiFi manual, WiFi auto)
- Error handling (disconnect, network, storage, permissions)
- First-time use (onboarding)
- Advanced use (multi-camera, review)
- Configuration (settings)

**Total: 13 distinct user journeys documented** 🎯
