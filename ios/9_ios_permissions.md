# iOS Network Permissions Guide
## Local Network Access for Canon Camera Discovery

**Last Updated:** 2026-01-08

---

## Overview

Starting with iOS 14, Apple requires explicit user permission for apps to access the local network. Since Canon camera discovery uses **UPnP/SSDP over UDP multicast** (239.255.255.250:1900), your app needs proper configuration and permissions.

---

## Required Permissions & Configuration

### 1. Info.plist Keys (Required)

You need to add two keys to your iOS Info.plist:

#### NSLocalNetworkUsageDescription (Required)

**Purpose:** Tells users why your app needs local network access

**Example:**
```xml
<key>NSLocalNetworkUsageDescription</key>
<string>This app needs to discover and connect to Canon cameras on your local network to automatically transfer photos.</string>
```

**User-facing:** This text appears in the permission dialog when your app first tries to access the local network.

#### NSBonjourServices (Required for triggering prompt)

**Purpose:** Declares the Bonjour service types your app uses

**For Canon cameras (UPnP/SSDP):**
```xml
<key>NSBonjourServices</key>
<array>
    <string>_upnp._tcp</string>
    <string>_ssdp._udp</string>
</array>
```

**Note:** Even though UPnP/SSDP uses custom multicast (not traditional Bonjour), declaring these service types helps trigger the permission prompt reliably on iOS 14+.

---

### 2. Multicast Entitlement (Required for UPnP/SSDP)

Since UPnP/SSDP uses **custom UDP multicast** (not standard Bonjour), you need the **restricted multicast entitlement**.

#### Entitlement Key

```xml
<key>com.apple.developer.networking.multicast</key>
<true/>
```

#### Why This is Required

From Apple's documentation:
> "Custom multicast and broadcast protocols require the com.apple.developer.networking.multicast restricted entitlement since these capabilities give your app complete access to the user's local network."

UPnP/SSDP broadcasts to 239.255.255.250:1900, which is a custom multicast protocol, not standard Bonjour discovery.

---

## How to Request Multicast Entitlement from Apple

### Step 1: Submit Request Form

**URL:** https://developer.apple.com/contact/request/networking-multicast

**Required Information:**
- Your Apple Developer Team ID
- App Name
- App Bundle ID
- App Apple ID (if already in App Store, otherwise explain it's pre-release)
- Justification for needing multicast access

### Step 2: Write Strong Justification

**Example justification:**

```
Our app enables professional photographers to automatically receive photos from Canon
cameras via WiFi. Canon cameras use the industry-standard UPnP/SSDP protocol for
device discovery, which requires UDP multicast to 239.255.255.250:1900.

This is the same protocol used by:
- Canon's official Camera Connect app
- Professional photography apps like Cascable and Capture One
- Adobe Lightroom's tethered capture feature

We need multicast networking to:
1. Discover Canon cameras on the local network via SSDP (Simple Service Discovery Protocol)
2. Receive camera announcements broadcast to the UPnP multicast address
3. Enable seamless camera-to-phone photo transfer for our users

Without this entitlement, our app cannot discover Canon cameras, making the core
functionality impossible.
```

### Step 3: Wait for Approval

- **Timeline:** Typically 2-4 weeks
- **Approval is team-based:** Applies to all apps under your Apple Developer account
- **Testing:** You can test in iOS Simulator without the entitlement, but physical devices require approval

### Step 4: Configure After Approval

Once approved, add to your Xcode project or Expo configuration (see below).

---

## Expo Configuration

### For Managed Workflow

Add to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "name": "Canon Camera App",
    "ios": {
      "bundleIdentifier": "com.yourcompany.canonapp",
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "This app needs to discover and connect to Canon cameras on your local network to automatically transfer photos.",
        "NSBonjourServices": [
          "_upnp._tcp",
          "_ssdp._udp"
        ]
      }
    }
  }
}
```

### For Multicast Entitlement (After Apple Approval)

**Option A: Using app.json (if Expo supports it)**

```json
{
  "expo": {
    "ios": {
      "entitlements": {
        "com.apple.developer.networking.multicast": true
      }
    }
  }
}
```

**Option B: Using Config Plugin**

Create a config plugin to add the entitlement:

```js
// config-plugin-multicast.js
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withMulticastEntitlement(config) {
  return withEntitlementsPlist(config, async (config) => {
    config.modResults['com.apple.developer.networking.multicast'] = true;
    return config;
  });
};
```

Then in `app.json`:

```json
{
  "expo": {
    "plugins": [
      "./config-plugin-multicast.js"
    ]
  }
}
```

**Option C: Manually in Xcode (Bare Workflow)**

After running `npx expo prebuild`:

1. Open `ios/YourApp.xcworkspace` in Xcode
2. Select your target → Signing & Capabilities
3. Click "+ Capability"
4. Add "Multicast Networking"
5. Or manually edit `ios/YourApp/YourApp.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.networking.multicast</key>
    <true/>
</dict>
</plist>
```

---

## How the Permission Flow Works

### 1. First Launch - Permission Prompt

When your app first tries to use local network (e.g., listens on UDP 1900), iOS shows this dialog:

```
┌─────────────────────────────────────────┐
│  "Canon Camera App" Would Like to       │
│  Find and Connect to Devices on Your    │
│  Local Network                          │
│                                         │
│  This app needs to discover and connect │
│  to Canon cameras on your local network │
│  to automatically transfer photos.      │
│                                         │
│         [Don't Allow]    [OK]           │
└─────────────────────────────────────────┘
```

**Important:** The text shown is from `NSLocalNetworkUsageDescription` in your Info.plist!

### 2. User Grants Permission

If user taps "OK":
- ✅ App can now send/receive on local network
- ✅ UPnP discovery works
- ✅ Permission saved (won't ask again)

### 3. User Denies Permission

If user taps "Don't Allow":
- ❌ App cannot access local network
- ❌ UPnP discovery fails silently
- ❌ No camera discovery possible

**You should:**
- Detect the permission denial
- Show user-friendly error message
- Provide button to open Settings

### 4. Checking Permission Status

Unfortunately, there's **no direct API** to check local network permission status. You can:

**Option A: Try and fail gracefully**
```swift
// Try to create UDP connection
// If it fails, assume permission denied
```

**Option B: Use a library**
```bash
npm install @generac/react-native-local-network-permission
```

```typescript
import { checkLocalNetworkPermission } from '@generac/react-native-local-network-permission';

const hasPermission = await checkLocalNetworkPermission();
if (!hasPermission) {
  // Show error and guide to Settings
}
```

### 5. Directing User to Settings

If permission denied, guide user to Settings:

```typescript
import { Linking, Alert } from 'react-native';

Alert.alert(
  'Local Network Access Required',
  'Please enable Local Network access in Settings to discover Canon cameras.',
  [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => Linking.openSettings()
    }
  ]
);
```

User must manually go to:
**Settings → Privacy & Security → Local Network → Your App → Toggle ON**

---

## Testing Considerations

### iOS Simulator
- ✅ Can test without multicast entitlement
- ✅ No permission prompt (automatically granted)
- ⚠️ May not accurately reflect real device behavior

### Physical iOS Device (Development)
- ❌ Requires multicast entitlement from Apple
- ✅ Shows actual permission prompt
- ✅ Tests real network discovery

### TestFlight
- ✅ Works with approved multicast entitlement
- ✅ Shows permission prompt to testers
- ✅ Full network functionality

### App Store
- ✅ Requires approved multicast entitlement
- ✅ App will be rejected without proper justification
- ✅ Users see permission prompt on first network access

---

## Common Issues & Solutions

### Issue 1: Permission Prompt Never Shows

**Symptoms:**
- App doesn't show local network permission dialog
- UPnP discovery doesn't work
- No errors in console

**Solutions:**
1. ✅ Add `NSLocalNetworkUsageDescription` to Info.plist
2. ✅ Add `NSBonjourServices` array to Info.plist
3. ✅ Rebuild app (changes don't apply via OTA update)
4. ✅ Delete app and reinstall (permission state cached)

### Issue 2: UPnP Discovery Works in Simulator, Not on Device

**Cause:** Missing multicast entitlement

**Solution:**
1. Request `com.apple.developer.networking.multicast` from Apple
2. Add entitlement to your Xcode project/Expo config
3. Rebuild with entitlement

### Issue 3: "NoAuth" Error When Listening on UDP

**Cause:** App blocked from local network without prompt

**Solution:**
- Ensure `NSBonjourServices` is set (this triggers the prompt)
- The prompt is triggered when iOS detects your app receiving broadcast/multicast data

### Issue 4: Works on iOS 13, Broken on iOS 14+

**Cause:** iOS 14 introduced local network privacy controls

**Solution:**
- Add all required Info.plist keys
- Request multicast entitlement
- Update app to handle permission denial gracefully

---

## Implementation Checklist

### Before Coding
- [ ] Request multicast entitlement from Apple (allow 2-4 weeks)
- [ ] Prepare justification (explain UPnP/SSDP usage)
- [ ] Wait for Apple approval

### In Code
- [ ] Add `NSLocalNetworkUsageDescription` to Info.plist
- [ ] Add `NSBonjourServices` array to Info.plist
- [ ] Add multicast entitlement (after approval)
- [ ] Configure in Expo app.json or config plugin
- [ ] Implement permission check/request flow
- [ ] Handle permission denial gracefully
- [ ] Provide Settings navigation for denied state

### Testing
- [ ] Test permission prompt appears on first network access
- [ ] Test camera discovery works after granting permission
- [ ] Test graceful failure when permission denied
- [ ] Test Settings navigation flow
- [ ] Test on physical iOS device (not just simulator)
- [ ] Test in TestFlight before App Store submission

### App Store Submission
- [ ] Include multicast entitlement in build
- [ ] Provide clear explanation in App Review notes
- [ ] Reference industry-standard UPnP/SSDP protocol
- [ ] Explain why camera discovery requires multicast

---

## Example: Complete Permission Flow

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, Button, Alert, Linking } from 'react-native';
import CanonPtp from './modules/canon-ptp';

export default function CameraDiscovery() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    checkAndRequestPermission();
  }, []);

  const checkAndRequestPermission = async () => {
    try {
      // Attempt to start discovery
      // This will trigger permission prompt if not yet shown
      await CanonPtp.discoverCameras();
      setPermissionGranted(true);
    } catch (error) {
      // If discovery fails, likely permission denied
      setPermissionGranted(false);
      showPermissionDeniedAlert();
    }
  };

  const showPermissionDeniedAlert = () => {
    Alert.alert(
      'Local Network Access Required',
      'This app needs access to your local network to discover Canon cameras. Please enable Local Network access in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => Linking.openSettings()
        }
      ]
    );
  };

  if (permissionGranted === null) {
    return <Text>Checking permissions...</Text>;
  }

  if (permissionGranted === false) {
    return (
      <View>
        <Text>Local Network Access Denied</Text>
        <Text>Please enable in Settings → Privacy → Local Network</Text>
        <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        <Button title="Try Again" onPress={checkAndRequestPermission} />
      </View>
    );
  }

  return (
    <View>
      <Text>Discovering cameras...</Text>
      <Button title="Refresh" onPress={checkAndRequestPermission} />
      {cameras.map(camera => (
        <Text key={camera.ip}>{camera.name}</Text>
      ))}
    </View>
  );
}
```

---

## Key Takeaways

1. **Three Requirements:**
   - NSLocalNetworkUsageDescription (Info.plist)
   - NSBonjourServices (Info.plist)
   - com.apple.developer.networking.multicast (Entitlement - requires Apple approval)

2. **Multicast Entitlement is Critical:**
   - UPnP/SSDP won't work without it on physical devices
   - Requires Apple approval (submit request early!)
   - Testing on simulator doesn't require it (misleading)

3. **User Experience:**
   - Permission prompt shows automatically on first network access
   - No way to programmatically check status (iOS limitation)
   - Must handle denial gracefully and guide to Settings

4. **Timeline:**
   - Request entitlement 2-4 weeks before you need it
   - Changes to Info.plist require new build (no OTA update)
   - Plan for permission flow in your UX design

---

## References

- [NSLocalNetworkUsageDescription - Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)
- [Multicast Networking Entitlement - Apple](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast)
- [How to use multicast networking in your app - Apple](https://developer.apple.com/news/?id=0oi77447)
- [Request Multicast Entitlement - Apple](https://developer.apple.com/contact/request/networking-multicast)
- [Support local network privacy - WWDC20](https://developer.apple.com/videos/play/wwdc2020/10110/)
- [iOS Permissions and Discovery - Google Cast](https://developers.google.com/cast/docs/ios_sender/permissions_and_discovery)
- [Expo Permissions Guide](https://docs.expo.dev/guides/permissions/)
- [react-native-local-network-permission](https://www.npmjs.com/package/@generac/react-native-local-network-permission)
