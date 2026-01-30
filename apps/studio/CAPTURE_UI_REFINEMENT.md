# Capture Flow UI Refinement Progress

**Goal:** Refine all capture flow views to be iOS native and use theme colors

**Scope:** From clicking Capture tab → Disconnect

---

## Progress Summary

- ✅ 7/8 views completed (87.5%)
- ⏳ 1/8 views remaining (1 new view)

---

## View Checklist

### ✅ 1. ManufacturerSelectionView
**Status:** Complete

**Changes made:**
- ✅ Theme colors applied (Color.Theme.*)
- ✅ Button order: Canon, Nikon, Sony
- ✅ "Coming Soon" badge removed
- ✅ Disabled buttons muted (60% opacity)

---

### ✅ 2. HotspotSetupView
**Status:** Complete

**Changes made:**
- ✅ Theme colors applied (Color.Theme.*)
- ✅ Back button verified (toolbar pattern correct)
- ✅ Design refined (title size, visual hierarchy)
- ✅ WiFi icon and instruction styling updated
- ✅ Next button uses `.buttonStyle(.primary)` (matches sign in button)
- ✅ "Enter IP Manually" button removed
- ✅ Instruction numbers: removed circles, added period, muted color
- ✅ Instruction text: most text muted, key words prominent (Settings, Personal Hotspot, etc.)

---

### ✅ 3. CameraDiscoveryView
**Status:** Complete

**Changes made:**
- ✅ Removed redundant status bar (was duplicating scan state info)
- ✅ Theme colors applied throughout (Color.Theme.*)
- ✅ Camera row: primary color icon, themed border, muted chevron
- ✅ Empty states: muted icons and text
- ✅ Toolbar back button: primary color
- ✅ "Rescan" button uses `.buttonStyle(.primary)`
- ✅ "Enter IP Manually" uses `.buttonStyle(.ghost)`
- ✅ Simplified UI: removed ~50 lines of redundant code

---

### ✅ 4. ManualIPEntryView (formerly WiFiSetupView)
**Status:** Complete

**Changes made:**
- ✅ Renamed from WiFiSetupView to ManualIPEntryView
- ✅ Theme colors applied (Color.Theme.*)
- ✅ Icon size reduced from 80 to 50
- ✅ Connect button uses `.buttonStyle(.primary)`
- ✅ All text and UI elements use theme colors
- ✅ Removed subtitle and helper text for cleaner UI
- ✅ Changed title to "Enter Camera IP"
- ✅ Created TextFieldStyles.swift with `.themed()` style
- ✅ TextField now uses `.textFieldStyle(.themed())` matching button sizing (height 50, radius 12)

---

### ✅ 5. ConnectingView
**Status:** Complete

**Changes made:**
- ✅ Theme colors applied (Color.Theme.*)
- ✅ Removed technical details (IP address, retry count)
- ✅ Simplified to clean "Connecting..." with spinner
- ✅ Removed ConnectionStore dependency
- ✅ Clean, user-friendly loading state
- ✅ **Fixed:** Connection now properly cancels when Close button clicked
- ✅ Registers cleanup handler to cancel connection Task

---

### ✅ 6. LiveCaptureView
**Status:** Complete

**Changes made:**
- ✅ All theme colors applied (Color.Theme.*)
- ✅ Simplified toolbar (removed complex status indicators)
- ✅ Just camera name in toolbar (minimal and clean)
- ✅ **Removed redundant Disconnect button** (Close button handles everything)
- ✅ Empty state themed and clean
- ✅ RAW skip banner simplified (removed material blur)
- ✅ PhotoListRow fully themed
- ✅ Removed dead code and unused properties
- ✅ Semantic colors kept where appropriate (green/orange for success/warning)

---

### ✅ 7. ConnectionErrorView
**Status:** Complete

**Changes made:**
- ✅ Theme colors applied (Color.Theme.*)
- ✅ Error icon color: Color.Theme.destructive
- ✅ Button uses `.buttonStyle(.primary)`
- ✅ "Try Again" behavior confirmed: full reset via `backToManufacturerSelection()`
- ✅ Verified error sources: manual IP failures (common) + discovery edge cases (rare)

---

### ⏳ 8. Camera-Specific Setup Guide (NEW)
**Status:** Not started

**Purpose:**
- Shows between Hotspot Setup and Camera Discovery
- Camera-specific instructions (Canon/Nikon/Sony)
- Sheet/modal presentation with manufacturer-specific WiFi setup steps
- Helps users enable WiFi transfer mode on their specific camera model

**Needs:**
- Design sheet layout
- Create manufacturer-specific instruction content
- Add images/icons for each step
- Theme colors and button styling
- "Next" button to proceed to scanning

---

## Investigation Tasks

### ✅ 1. Photo Detection & Download Flow
**Status:** Complete

**Findings:**
- Canon uses adaptive polling (50-200ms intervals) via Canon_EOS_GetEvent
- Downloads are sequential (awaited one-by-one in for loop)
- RAW files filtered at GetObjectInfo stage
- Two-phase delegate: didDetectPhoto (immediate) + didCompleteDownload (after download)

**Implementation:**
- ✅ Added placeholder photos with download status
- ✅ Progressive UI updates (show photo immediately, thumbnail loads after)
- ✅ Status badge: spinner → arrow.down.circle (primary color)

### ✅ 2. Disconnection Flow & UI
**Status:** Complete

**Findings:**
- Disconnect waits for current poll batch to complete (all photos detected in that poll)
- Graceful timeout: 1 second, then force cancel (but still awaits task completion)
- Expected duration: 200-600ms (idle) to 5-10+ seconds (burst shooting)
- Current poll batch downloads sequentially before task exits (no Task.checkCancellation())

**Implementation:**
- ✅ Added "Disconnecting..." overlay with spinner
- ✅ Shows when TransferSession.end() starts
- ✅ Documented behavior in PTP_IP_ARCHITECTURE.md

---

## Global Changes Applied

### ✅ Shell/Container
- ✅ Changed from sheet to fullScreenCover
- ✅ Close button moved to top-right (icon only)
- ✅ NavigationStack wrapper added

### ✅ Cleanup System
- ✅ Cleanup registration implemented
- ✅ Scanner cancellation (no wait)
- ✅ Camera disconnect (waits for completion)

---

## Next Steps

Continue with view #2 (HotspotSetupView) when ready.
